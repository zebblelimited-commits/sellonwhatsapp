// utils/generateTracking.ts
export const generateZebbleTrackingId = () => {
  const prefix = "ZEB";
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const dateStr = new Date().toISOString().slice(2,4) + new Date().toISOString().slice(5,7); 
  return `${prefix}-${dateStr}-${randomStr}`; // Result: ZEB-2605-A1B2C3
};