// Animation keyframes shared by the cashier list and detail views. Imported
// for side-effects; injects a single <style> tag once per document.
const CASHIER_KEYFRAMES_ID = "cashier-keyframes";

if (typeof document !== "undefined" && !document.getElementById(CASHIER_KEYFRAMES_ID)) {
    const style = document.createElement("style");
    style.id = CASHIER_KEYFRAMES_ID;
    style.textContent = `
        @keyframes cashier-focus-in {
            from { opacity: 0; transform: scale(0.96); }
            to   { opacity: 1; transform: scale(1); }
        }
        @keyframes cashier-pop {
            0%   { opacity: 0; transform: scale(0.6); }
            70%  { transform: scale(1.05); }
            100% { opacity: 1; transform: scale(1); }
        }
        @keyframes cashier-deal {
            from { opacity: 0; transform: translateX(-12px) scale(0.97); }
            to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes cashier-bar-fill {
            from { transform: scaleX(0); }
            to   { transform: scaleX(1); }
        }
        @keyframes cashier-number-count {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cashier-new-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
    `;
    document.head.appendChild(style);
}
