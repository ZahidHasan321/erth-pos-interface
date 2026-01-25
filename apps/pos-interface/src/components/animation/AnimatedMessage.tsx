"use client";

import { motion, AnimatePresence } from "framer-motion";

interface AnimatedMessageProps {
    error?: string;
    warning?: string;
    info?: string;
}

export const AnimatedMessage = ({ error, warning, info }: AnimatedMessageProps) => {
    const message = error || warning || info;
    const type = error ? "error" : warning ? "warning" : info ? "info" : null;

    const colorMap: Record<string, string> = {
        error: "text-red-500",
        warning: "text-amber-500",
        info: "text-blue-500",
    };

    return (
        <AnimatePresence mode="wait">
            {message && (
                <motion.p
                    key={message}
                    initial={{ opacity: 0, y: -3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={{ duration: 0.18 }}
                    className={`text-sm ${colorMap[type!]} mt-1`}
                >
                    {message}
                </motion.p>
            )}
        </AnimatePresence>
    );
};