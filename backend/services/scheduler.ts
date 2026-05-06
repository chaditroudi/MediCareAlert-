import cron from "node-cron";
import { MedicationModel, UserModel } from "../models";
import { sendReminderEmail, sendStockAlertEmail } from "./emailService";
import { getIO } from "../socket";

// Simple reminder cadence: one early reminder, then the due-time alert.
const REMINDER_OFFSETS = [15, 0];

// Track which reminders have already been sent today: "medId:schedTime:offset"
const sentReminders = new Set<string>();

// Clear the tracker at midnight
const resetAtMidnight = () => {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    sentReminders.clear();
  }
};

/** Convert "HH:MM" to total minutes since midnight */
const timeToMinutes = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** Convert total minutes back to "HH:MM" */
const minutesToTime = (m: number): string => {
  const h = Math.floor(((m % 1440) + 1440) % 1440 / 60);
  const min = ((m % 1440) + 1440) % 1440 % 60;
  return h.toString().padStart(2, "0") + ":" + min.toString().padStart(2, "0");
};

/** Get the reminder label for in-app notification */
const getReminderMessage = (medName: string, dosage: string, doseTime: string, minBefore: number): string => {
  if (minBefore === 0) return `C'est l'heure de prendre ${medName} (${dosage}) — dose de ${doseTime}`;
  return `Dans ${minBefore} min : ${medName} (${dosage}) — dose prévue à ${doseTime}`;
};

// Run every minute to check medication schedules
export const startScheduler = () => {
  // Multi-reminder cron — runs every minute
  cron.schedule("* * * * *", async () => {
    try {
      resetAtMidnight();

      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const today = now.toISOString().split("T")[0];

      // For each offset, compute the dose time that would trigger NOW
      // e.g. if offset=15 and currentMinutes=480 (08:00), we look for doses at 08:15
      const targetDoseTimes = REMINDER_OFFSETS.map(offset => ({
        offset,
        doseTime: minutesToTime(currentMinutes + offset),
      }));

      // Collect all unique dose times to query
      const allDoseTimes = [...new Set(targetDoseTimes.map(t => t.doseTime))];

      // Find all active medications with any of these schedule times
      const medications = await MedicationModel.find({
        isActive: true,
        schedules: { $in: allDoseTimes },
      });

      const io = getIO();

      for (const med of medications) {
        // Check if medication is within active period
        const startDate = new Date(med.startDate);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + (med.durationInDays || 0));
        if (now > endDate) continue;

        for (const { offset, doseTime } of targetDoseTimes) {
          // Check if this med actually has this dose time
          if (!med.schedules.includes(doseTime)) continue;

          const reminderKey = `${med._id}:${doseTime}:${offset}:${today}`;
          if (sentReminders.has(reminderKey)) continue;

          // For offset=0 (dose time), skip if already taken
          if (offset === 0) {
            const alreadyHandled = med.history.some(
              (h: any) => h.date === today && h.time === doseTime,
            );
            if (alreadyHandled) continue;
          }

          // Mark as sent
          sentReminders.add(reminderKey);

          // Fetch user
          const user = await UserModel.findById(med.userId);
          if (!user) continue;

          const message = getReminderMessage(med.name, med.dosage || "", doseTime, offset);

          // 1) Send email
          if (user.email) {
            await sendReminderEmail(
              user.email,
              user.name,
              med.name,
              med.dosage || "",
              doseTime,
              (med as any).imageUrl,
              offset
            );
          }

          // 2) Send real-time in-app notification via Socket.io
          if (io) {
            io.to(`user:${user._id}`).emit("med:reminder", {
              type: offset === 0 ? "DOSE_NOW" : "DOSE_UPCOMING",
              medName: med.name,
              dosage: med.dosage || "",
              doseTime,
              minutesBefore: offset,
              message,
              timestamp: now.toISOString(),
            });
          }

          console.log(`[Scheduler] Reminder (${offset === 0 ? "NOW" : `-${offset}min`}) → ${user.email || user.name} for "${med.name}" at ${doseTime}`);
        }
      }
    } catch (err) {
      console.error("Reminder cron error:", err);
    }
  });

  // Check for missed doses every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const today = now.toISOString().split("T")[0];
      const io = getIO();

      const medications = await MedicationModel.find({ isActive: true });

      for (const med of medications) {
        // Check if medication is within active period
        const startDate = new Date(med.startDate);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + (med.durationInDays || 0));
        if (now > endDate) continue;

        for (const schedTime of med.schedules) {
          const [schedH, schedM] = schedTime.split(":").map(Number);

          // If the scheduled time has passed by more than 30 minutes
          const schedMinutes = schedH * 60 + schedM;
          const currentMinutes = currentHour * 60 + currentMinute;
          if (
            currentMinutes - schedMinutes < 30 ||
            currentMinutes - schedMinutes > 120
          )
            continue;

          // Check if this dose was taken or already marked missed
          const exists = med.history.some(
            (h: any) => h.date === today && h.time === schedTime,
          );
          if (exists) continue;

          // Mark as missed
          med.history.push({
            date: today,
            time: schedTime,
            status: "missed",
          });

          // Notify user of missed dose via socket
          if (io) {
            io.to(`user:${med.userId}`).emit("med:reminder", {
              type: "DOSE_MISSED",
              medName: med.name,
              dosage: med.dosage || "",
              doseTime: schedTime,
              minutesBefore: 0,
              message: `Dose manquée : ${med.name} (${med.dosage || ""}) prévue à ${schedTime}`,
              timestamp: now.toISOString(),
            });
          }
        }

        if (med.isModified("history")) {
          await med.save();
        }
      }
    } catch (err) {
      console.error("Missed dose cron error:", err);
    }
  });

  // Check stock alerts daily at 9 AM
  cron.schedule("0 9 * * *", async () => {
    try {
      const medications = await MedicationModel.find({
        isActive: true,
        $expr: { $lte: ["$stockCount", "$threshold"] },
      });

      for (const med of medications) {
        if (med.stockCount <= 0) continue;
        const user = await UserModel.findById(med.userId);
        if (user?.email) {
          await sendStockAlertEmail(
            user.email,
            user.name,
            med.name,
            med.stockCount,
          );
        }
      }
    } catch (err) {
      console.error("Stock alert cron error:", err);
    }
  });

  console.log(
    "Scheduler started: multi-reminder (15/0 min), missed-dose detection, stock alerts",
  );
};
