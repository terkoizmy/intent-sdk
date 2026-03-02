/**
 * Alert Manager — Phase H
 *
 * Provides a structured way to report and track system alerts
 * like low inventory or failed claim transactions.
 *
 * Used by: SettlementManager, DynamicPricing, Rebalancer
 */

import type { ChainId } from "../../types/common";

export type AlertLevel = "info" | "warning" | "critical";

export interface Alert {
    id: string;
    level: AlertLevel;
    message: string;
    timestamp: number;
    context?: Record<string, unknown>;
}

export class AlertManager {
    private alerts: Alert[] = [];
    private readonly MAX_ALERTS = 1000;
    private nextId = 1;

    /**
     * Create a generalized structured alert
     */
    alert(level: AlertLevel, message: string, context?: Record<string, unknown>): void {
        const item: Alert = {
            id: `alert-${this.nextId++}`,
            level,
            message,
            timestamp: Date.now(),
            context,
        };

        this.alerts.push(item);

        // Keep memory bounded
        if (this.alerts.length > this.MAX_ALERTS) {
            this.alerts.shift();
        }

        // Production-ready: emit to stdout/stderr in standardized format
        // Could be piped to external monitoring tools (Datadog, Sentry, etc.)
        if (level === "critical") {
            console.error(`[ALERT:CRITICAL] ${message}`, context ? context : "");
        } else if (level === "warning") {
            console.warn(`[ALERT:WARNING] ${message}`, context ? context : "");
        } else {
            console.info(`[ALERT:INFO] ${message}`, context ? context : "");
        }
    }

    /**
     * Helper to create a standardized low inventory warning
     */
    alertLowInventory(chainId: ChainId, token: string, available: string, threshold: string): void {
        this.alert(
            "warning",
            `Low inventory on chain ${chainId} for ${token}: available ${available} < threshold ${threshold}`,
            { chainId, token, available, threshold },
        );
    }

    /**
     * Helper to create a critical alert when a settlement claim fails repeatedly
     */
    alertFailedClaim(intentId: string, reason: string, attempt: number): void {
        this.alert(
            "critical",
            `Failed claim for intent ${intentId} on attempt ${attempt}. Reason: ${reason}`,
            { intentId, reason, attempt },
        );
    }

    /**
     * Retrieve stored alerts, optionally filtered by severity
     */
    getAlerts(level?: AlertLevel): Alert[] {
        if (level) {
            return this.alerts.filter((a) => a.level === level);
        }
        return [...this.alerts];
    }

    /**
     * Clear all stored alerts
     */
    clearAlerts(): void {
        this.alerts = [];
    }
}
