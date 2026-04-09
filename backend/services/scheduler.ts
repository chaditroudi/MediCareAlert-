import cron from "node-cron";
import { MedicationModel, UserModel } from "../models";
import { sendReminderEmail, sendStockAlertEmail } from "./emailService";

// Run every minute to check medication schedules
export const startScheduler = () => {
  // Check medication reminders every minute
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();
      const currentTime =
        now.getHours().toString().padStart(2, "0") +
        ":" +
        now.getMinutes().toString().padStart(2, "0");
      const today = now.toISOString().split("T")[0];

      // Find all active medications that have this time in their schedules
      const medications = await MedicationModel.find({
        isActive: true,
        schedules: currentTime,
      });

      for (const med of medications) {
        const alreadyHandled = med.history.some(
          (h: any) => h.date === today && h.time === currentTime,
        );
        if (alreadyHandled) continue;

        // Check if medication is within active period
        const startDate = new Date(med.startDate);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + (med.durationInDays || 0));
        if (now > endDate) continue;

        // Send email reminder
        const user = await UserModel.findById(med.userId);
        if (user?.email) {
          await sendReminderEmail(
            user.email,
            user.name,
            med.name,
            med.dosage || "",
            currentTime,
            (med as any).imageUrl
          );
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
    "Scheduler started: reminders, missed-dose detection, stock alerts",
  );
};
