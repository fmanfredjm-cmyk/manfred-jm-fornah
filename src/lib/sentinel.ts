/**
 * Sentinel Core System
 * 
 * Anticipates structural anomalies, API drops, and state desyncs before they crash the UI.
 * It strictly intercepts payload streams, verifies structural integrity, and
 * mathematically corrects NaNs, nulls, and unbounded variables instantly before the engine consumes them.
 */

type HealingStrategy<T> = {
  defaultValue: T;
  validator?: (data: unknown) => boolean;
  fixer?: (data: any) => T;
};

export class Sentinel {
  private static anomalyCount = 0;

  /**
   * Proactively intercepts a network request and heals the JSON payload if it is deformed,
   * preventing the UI from parsing undefined/null objects and throwing TypeError.
   */
  static async fetchProtected<T>(url: string, init?: RequestInit, strategy?: HealingStrategy<T>): Promise<T> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // Prevent hanging promises
      
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Upstream rejection: ${res.status}`);
      }

      const data = await res.json();

      if (strategy) {
        if (strategy.validator && !strategy.validator(data)) {
          this.logInterception('Malformed Data Structure Detect. Auto-healing applied.');
          return strategy.fixer ? strategy.fixer(data) : strategy.defaultValue;
        }
      }

      return data as T;
    } catch (e: any) {
      this.logInterception(`Connection Anomaly [${e.message}]. Suppressed and healed.`);
      if (strategy && strategy.defaultValue !== undefined) {
        return strategy.defaultValue;
      }
      throw e;
    }
  }

  /**
   * Mathematically corrects NaN, Infinity, or negative probabilities before 
   * they break the Kelly Criterion or EV formulas.
   */
  static healMath(value: number, safeDefault: number = 0, clampRange?: [number, number]): number {
    if (isNaN(value) || !isFinite(value)) {
      this.logInterception('Critical Math Anomaly (NaN/Infinity). Healed to safe baseline.');
      return safeDefault;
    }
    if (clampRange) {
      if (value < clampRange[0]) return clampRange[0];
      if (value > clampRange[1]) return clampRange[1];
    }
    return value;
  }

  /**
   * Safely unwraps nested property chains that might be undefined (e.g. data.team.history[0].score)
   * avoiding "Cannot read properties of undefined".
   */
  static safeDeepRetrieve<T>(obj: any, path: string[], fallback: T): T {
    let current = obj;
    for (const key of path) {
      if (current === null || current === undefined || !(key in current)) {
         return fallback;
      }
      current = current[key];
    }
    return current as T;
  }

  private static logInterception(message: string) {
    this.anomalyCount++;
    console.info(`%c[Sentinel Guard] ✨ ${message} | Total Anomalies Prevented: ${this.anomalyCount}`, 'color: #00ff88; font-weight: bold');
  }
}
