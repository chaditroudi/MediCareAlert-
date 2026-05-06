import {
  MedicationCategoryModel,
  MedicationModel,
  PatientRequestModel,
  PharmacyInventoryModel,
  PharmacyModel,
  PrescriptionModel,
  UserModel,
} from "../models";
import { Request, Response } from "express";

const calcChange = (current: number, previous: number) =>
  previous === 0
    ? current > 0 ? 100 : 0
    : Math.round(((current - previous) / previous) * 100);

const growthPipeline = (model: any, since: Date) =>
  model.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

export const getFullAnalytics = async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // 1. Core counts
    const [
      totalUsers, activeUsers, patients, pharmacists, admins,
      totalPharmacies, activePharmacies,
      totalMedications, activeMedications,
      totalPrescriptions, processedPrescriptions, failedPrescriptions, pendingPrescriptions,
      totalRequests, pendingRequests, confirmedRequests, outOfStockRequests, resolvedRequests,
      totalInventory, availableStock, lowStock, outOfStockInv, expiredStock,
      totalCategories,
    ] = await Promise.all([
      UserModel.countDocuments(),
      UserModel.countDocuments({ isActive: true }),
      UserModel.countDocuments({ role: "PATIENT" }),
      UserModel.countDocuments({ role: "PHARMACIST" }),
      UserModel.countDocuments({ role: "ADMIN" }),
      PharmacyModel.countDocuments(),
      PharmacyModel.countDocuments({ isActive: true }),
      MedicationModel.countDocuments(),
      MedicationModel.countDocuments({ isActive: true }),
      PrescriptionModel.countDocuments(),
      PrescriptionModel.countDocuments({ status: "processed" }),
      PrescriptionModel.countDocuments({ status: "failed" }),
      PrescriptionModel.countDocuments({ status: "pending" }),
      PatientRequestModel.countDocuments(),
      PatientRequestModel.countDocuments({ status: "pending" }),
      PatientRequestModel.countDocuments({ status: "confirmed" }),
      PatientRequestModel.countDocuments({ status: "out_of_stock" }),
      PatientRequestModel.countDocuments({ status: "resolved" }),
      PharmacyInventoryModel.countDocuments(),
      PharmacyInventoryModel.countDocuments({ stockStatus: "available" }),
      PharmacyInventoryModel.countDocuments({ stockStatus: "low" }),
      PharmacyInventoryModel.countDocuments({ stockStatus: "out_of_stock" }),
      PharmacyInventoryModel.countDocuments({ stockStatus: "expired" }),
      MedicationCategoryModel.countDocuments({ isActive: true }),
    ]);

    // 2. Growth trends (30 days)
    const [userGrowth, requestGrowth, prescriptionGrowth, medicationGrowth] =
      await Promise.all([
        growthPipeline(UserModel, thirtyDaysAgo),
        growthPipeline(PatientRequestModel, thirtyDaysAgo),
        growthPipeline(PrescriptionModel, thirtyDaysAgo),
        growthPipeline(MedicationModel, thirtyDaysAgo),
      ]);

    // 3. Weekly comparisons
    const [
      thisWeekUsers, lastWeekUsers,
      thisWeekRequests, lastWeekRequests,
      thisWeekPrescriptions, lastWeekPrescriptions,
      thisWeekMeds, lastWeekMeds,
    ] = await Promise.all([
      UserModel.countDocuments({ createdAt: { $gte: oneWeekAgo } }),
      UserModel.countDocuments({ createdAt: { $gte: twoWeeksAgo, $lt: oneWeekAgo } }),
      PatientRequestModel.countDocuments({ createdAt: { $gte: oneWeekAgo } }),
      PatientRequestModel.countDocuments({ createdAt: { $gte: twoWeeksAgo, $lt: oneWeekAgo } }),
      PrescriptionModel.countDocuments({ createdAt: { $gte: oneWeekAgo } }),
      PrescriptionModel.countDocuments({ createdAt: { $gte: twoWeeksAgo, $lt: oneWeekAgo } }),
      MedicationModel.countDocuments({ createdAt: { $gte: oneWeekAgo } }),
      MedicationModel.countDocuments({ createdAt: { $gte: twoWeeksAgo, $lt: oneWeekAgo } }),
    ]);

    // 4. Monthly comparisons
    const [
      thisMonthUsers, lastMonthUsers,
      thisMonthRequests, lastMonthRequests,
    ] = await Promise.all([
      UserModel.countDocuments({ createdAt: { $gte: oneMonthAgo } }),
      UserModel.countDocuments({ createdAt: { $gte: twoMonthsAgo, $lt: oneMonthAgo } }),
      PatientRequestModel.countDocuments({ createdAt: { $gte: oneMonthAgo } }),
      PatientRequestModel.countDocuments({ createdAt: { $gte: twoMonthsAgo, $lt: oneMonthAgo } }),
    ]);

    // 5. Top medications
    const topMedications = await MedicationModel.aggregate([
      { $group: { _id: "$name", count: { $sum: 1 }, activeCount: { $sum: { $cond: ["$isActive", 1, 0] } } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, name: "$_id", count: 1, activeCount: 1 } },
    ]);

    // 6. Top pharmacies
    const topPharmacies = await PatientRequestModel.aggregate([
      { $group: { _id: "$pharmacyId", requestCount: { $sum: 1 } } },
      { $sort: { requestCount: -1 } },
      { $limit: 10 },
      { $lookup: { from: "pharmacies", localField: "_id", foreignField: "_id", as: "pharmacy" } },
      { $unwind: { path: "$pharmacy", preserveNullAndEmptyArrays: true } },
      { $project: { _id: 0, pharmacyName: { $ifNull: ["$pharmacy.name", "Inconnue"] }, requestCount: 1 } },
    ]);

    // 7. Adherence analytics
    const adherenceData = await MedicationModel.aggregate([
      { $unwind: "$history" },
      { $group: { _id: "$history.status", count: { $sum: 1 } } },
    ]);
    const takenCount = adherenceData.find((d: any) => d._id === "taken")?.count || 0;
    const missedCount = adherenceData.find((d: any) => d._id === "missed")?.count || 0;
    const adherenceRate = takenCount + missedCount > 0
      ? Math.round((takenCount / (takenCount + missedCount)) * 100) : 0;

    // 8. Adherence trend (last 14 days)
    const adherenceTrend = await MedicationModel.aggregate([
      { $unwind: "$history" },
      { $match: { "history.date": { $exists: true } } },
      { $group: {
        _id: { date: "$history.date", status: "$history.status" },
        count: { $sum: 1 },
      }},
      { $sort: { "_id.date": -1 } },
      { $limit: 100 },
      { $group: {
        _id: "$_id.date",
        taken: { $sum: { $cond: [{ $eq: ["$_id.status", "taken"] }, "$count", 0] } },
        missed: { $sum: { $cond: [{ $eq: ["$_id.status", "missed"] }, "$count", 0] } },
      }},
      { $sort: { _id: -1 } },
      { $limit: 14 },
      { $sort: { _id: 1 } },
    ]);

    // 9. Prescription confidence & processing stats
    const prescriptionStats = await PrescriptionModel.aggregate([
      { $match: { status: "processed" } },
      { $group: {
        _id: null,
        avgConfidence: { $avg: "$overallConfidence" },
        avgProcessingTime: { $avg: "$processingTimeMs" },
        minConfidence: { $min: "$overallConfidence" },
        maxConfidence: { $max: "$overallConfidence" },
        totalMedsExtracted: { $sum: { $size: { $ifNull: ["$extractedData.medications", []] } } },
      }},
    ]);
    const pStats = prescriptionStats[0] || { avgConfidence: 0, avgProcessingTime: 0, minConfidence: 0, maxConfidence: 0, totalMedsExtracted: 0 };

    // 10. Inventory health by pharmacy
    const inventoryHealth = await PharmacyInventoryModel.aggregate([
      { $group: {
        _id: "$pharmacyId",
        total: { $sum: 1 },
        outOfStock: { $sum: { $cond: [{ $eq: ["$stockStatus", "out_of_stock"] }, 1, 0] } },
        low: { $sum: { $cond: [{ $eq: ["$stockStatus", "low"] }, 1, 0] } },
        expired: { $sum: { $cond: [{ $eq: ["$stockStatus", "expired"] }, 1, 0] } },
        available: { $sum: { $cond: [{ $eq: ["$stockStatus", "available"] }, 1, 0] } },
      }},
      { $addFields: { issueCount: { $add: ["$outOfStock", "$low", "$expired"] } } },
      { $sort: { issueCount: -1 } },
      { $limit: 10 },
      { $lookup: { from: "pharmacies", localField: "_id", foreignField: "_id", as: "pharmacy" } },
      { $unwind: { path: "$pharmacy", preserveNullAndEmptyArrays: true } },
      { $project: { _id: 0, pharmacyName: { $ifNull: ["$pharmacy.name", "Inconnue"] }, total: 1, outOfStock: 1, low: 1, expired: 1, available: 1, issueCount: 1 } },
    ]);

    // 11. Request resolution speed
    const resolutionStats = await PatientRequestModel.aggregate([
      { $match: { status: "resolved" } },
      { $project: { resolutionTime: { $subtract: ["$updatedAt", "$createdAt"] } } },
      { $group: {
        _id: null,
        avgResolutionMs: { $avg: "$resolutionTime" },
        minResolutionMs: { $min: "$resolutionTime" },
        maxResolutionMs: { $max: "$resolutionTime" },
        count: { $sum: 1 },
      }},
    ]);
    const rStats = resolutionStats[0] || { avgResolutionMs: 0, minResolutionMs: 0, maxResolutionMs: 0, count: 0 };

    // 12. Hourly activity heatmap
    const activityHeatmap = await PatientRequestModel.aggregate([
      { $project: { dayOfWeek: { $dayOfWeek: "$createdAt" }, hour: { $hour: "$createdAt" } } },
      { $group: { _id: { day: "$dayOfWeek", hour: "$hour" }, count: { $sum: 1 } } },
      { $sort: { "_id.day": 1, "_id.hour": 1 } },
    ]);

    // 13. Request flow (last 6 months)
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const requestFlow = await PatientRequestModel.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      { $group: {
        _id: {
          month: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          status: "$status",
        },
        count: { $sum: 1 },
      }},
      { $sort: { "_id.month": 1 } },
    ]);

    // 14. Medication frequency distribution
    const frequencyDistribution = await MedicationModel.aggregate([
      { $group: { _id: "$frequency", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
      { $project: { _id: 0, frequency: { $ifNull: ["$_id", "Non specifie"] }, count: 1 } },
    ]);

    // 15. Recent users
    const recentUsers = await UserModel.find({}).sort({ createdAt: -1 }).limit(10).select("name email role createdAt isActive");

    // Build Response
    const resolutionRate = totalRequests > 0 ? Math.round((resolvedRequests / totalRequests) * 100) : 0;
    const prescriptionSuccessRate = totalPrescriptions > 0 ? Math.round((processedPrescriptions / totalPrescriptions) * 100) : 0;
    const inventoryHealthScore = totalInventory > 0 ? Math.round((availableStock / totalInventory) * 100) : 100;

    res.json({
      users: { total: totalUsers, active: activeUsers, patients, pharmacists, admins },
      pharmacies: { total: totalPharmacies, active: activePharmacies, inactive: totalPharmacies - activePharmacies },
      medications: { total: totalMedications, active: activeMedications, inactive: totalMedications - activeMedications },
      prescriptions: {
        total: totalPrescriptions, processed: processedPrescriptions, failed: failedPrescriptions,
        pending: pendingPrescriptions, successRate: prescriptionSuccessRate,
        avgConfidence: Math.round((pStats.avgConfidence || 0) * 100),
        avgProcessingTime: Math.round(pStats.avgProcessingTime || 0),
        totalMedsExtracted: pStats.totalMedsExtracted,
      },
      requests: {
        total: totalRequests, pending: pendingRequests, confirmed: confirmedRequests,
        outOfStock: outOfStockRequests, resolved: resolvedRequests, resolutionRate,
        avgResolutionHours: Math.round((rStats.avgResolutionMs || 0) / 3600000 * 10) / 10,
      },
      inventory: {
        total: totalInventory, available: availableStock, low: lowStock,
        outOfStock: outOfStockInv, expired: expiredStock, healthScore: inventoryHealthScore,
      },
      categories: { total: totalCategories },
      growth: { users: userGrowth, requests: requestGrowth, prescriptions: prescriptionGrowth, medications: medicationGrowth },
      weeklyComparison: {
        users: { thisWeek: thisWeekUsers, lastWeek: lastWeekUsers, change: calcChange(thisWeekUsers, lastWeekUsers) },
        requests: { thisWeek: thisWeekRequests, lastWeek: lastWeekRequests, change: calcChange(thisWeekRequests, lastWeekRequests) },
        prescriptions: { thisWeek: thisWeekPrescriptions, lastWeek: lastWeekPrescriptions, change: calcChange(thisWeekPrescriptions, lastWeekPrescriptions) },
        medications: { thisWeek: thisWeekMeds, lastWeek: lastWeekMeds, change: calcChange(thisWeekMeds, lastWeekMeds) },
      },
      monthlyComparison: {
        users: { thisMonth: thisMonthUsers, lastMonth: lastMonthUsers, change: calcChange(thisMonthUsers, lastMonthUsers) },
        requests: { thisMonth: thisMonthRequests, lastMonth: lastMonthRequests, change: calcChange(thisMonthRequests, lastMonthRequests) },
      },
      topMedications,
      topPharmacies,
      adherence: { taken: takenCount, missed: missedCount, rate: adherenceRate, trend: adherenceTrend },
      inventoryHealth,
      activityHeatmap,
      requestFlow,
      frequencyDistribution,
      recentUsers: recentUsers.map((u: any) => ({
        id: u._id, name: u.name, email: u.email, role: u.role,
        createdAt: u.createdAt, isActive: u.isActive,
      })),
    });
  } catch (error) {
    console.error("Analytics error:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
};

export const getPersonalAnalytics = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.role === "PATIENT") {
      const [totalMeds, activeMeds, totalPrescriptions, processedPrescriptions, totalRequests, pendingReqs, resolvedReqs] =
        await Promise.all([
          MedicationModel.countDocuments({ userId }),
          MedicationModel.countDocuments({ userId, isActive: true }),
          PrescriptionModel.countDocuments({ userId }),
          PrescriptionModel.countDocuments({ userId, status: "processed" }),
          PatientRequestModel.countDocuments({ patientId: userId }),
          PatientRequestModel.countDocuments({ patientId: userId, status: "pending" }),
          PatientRequestModel.countDocuments({ patientId: userId, status: "resolved" }),
        ]);

      const adherenceData = await MedicationModel.aggregate([
        { $match: { userId: user._id } },
        { $unwind: "$history" },
        { $group: { _id: "$history.status", count: { $sum: 1 } } },
      ]);
      const taken = adherenceData.find((d: any) => d._id === "taken")?.count || 0;
      const missed = adherenceData.find((d: any) => d._id === "missed")?.count || 0;
      const rate = taken + missed > 0 ? Math.round((taken / (taken + missed)) * 100) : 0;

      return res.json({
        role: "PATIENT",
        medications: { total: totalMeds, active: activeMeds },
        prescriptions: { total: totalPrescriptions, processed: processedPrescriptions },
        requests: { total: totalRequests, pending: pendingReqs, resolved: resolvedReqs },
        adherence: { taken, missed, rate },
      });
    }

    if (user.role === "PHARMACIST") {
      const pharmacyId = user.pharmacyId;
      if (!pharmacyId) return res.json({ role: "PHARMACIST", noPharmacy: true });

      const [totalInv, outOfStockInv, lowStockInv, totalReqs, pendingReqs] =
        await Promise.all([
          PharmacyInventoryModel.countDocuments({ pharmacyId }),
          PharmacyInventoryModel.countDocuments({ pharmacyId, stockStatus: "out_of_stock" }),
          PharmacyInventoryModel.countDocuments({ pharmacyId, stockStatus: "low" }),
          PatientRequestModel.countDocuments({ pharmacyId }),
          PatientRequestModel.countDocuments({ pharmacyId, status: "pending" }),
        ]);

      return res.json({
        role: "PHARMACIST",
        inventory: { total: totalInv, outOfStock: outOfStockInv, low: lowStockInv },
        requests: { total: totalReqs, pending: pendingReqs },
      });
    }

    res.json({ role: user.role, message: "No specific analytics for this role" });
  } catch (error) {
    console.error("Personal analytics error:", error);
    res.status(500).json({ error: "Failed to fetch personal analytics" });
  }
};
