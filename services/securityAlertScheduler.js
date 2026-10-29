import { checkAndDispatchWeeklySecurityAlerts } from './securityAuditService.js';

let schedulerInterval = null;
let startupTimeout = null;

/**
 * Start the background scheduler that verifies weak/reused password alerts
 * and dispatches weekly emails to users whose vaults have vulnerabilities.
 */
export const startSecurityAlertScheduler = (intervalMs = 60 * 60 * 1000) => {
  if (schedulerInterval) return;

  // Run initial check 15 seconds after server startup
  startupTimeout = setTimeout(() => {
    checkAndDispatchWeeklySecurityAlerts().catch((err) => {
      console.error('[SecurityAlertScheduler] Startup check error:', err.message);
    });
  }, 15000);

  // Set recurring interval (default every 1 hour)
  schedulerInterval = setInterval(() => {
    checkAndDispatchWeeklySecurityAlerts().catch((err) => {
      console.error('[SecurityAlertScheduler] Periodic check error:', err.message);
    });
  }, intervalMs);

  console.log(`[SecurityAlertScheduler] Started. Checking weekly password alerts every ${Math.round(intervalMs / 60000)} minutes.`);
};

/**
 * Gracefully stop the background scheduler.
 */
export const stopSecurityAlertScheduler = () => {
  if (startupTimeout) {
    clearTimeout(startupTimeout);
    startupTimeout = null;
  }
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[SecurityAlertScheduler] Stopped.');
  }
};
