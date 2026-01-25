"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import * as React from "react";
import { motion } from "framer-motion";

interface StepProps {
  title: string;
  description?: string;
  isCompleted?: boolean;
  isActive?: boolean;
  onClick?: () => void;
  index: number;
}

const Step: React.FC<StepProps> = ({
  title,
  isCompleted,
  isActive,
  onClick,
  index,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center cursor-pointer px-2 sm:px-3 md:px-4 py-1 rounded-lg transition-all group relative",
        "hover:bg-accent/30 hover:shadow-sm",
        "focus:outline-none",
        isActive && "bg-accent/20 shadow-sm"
      )}
    >
      <div className="relative flex flex-col items-center">
        <motion.div
          layout
          className={cn(
            "w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full border-2 flex items-center justify-center transition-all font-semibold shadow-sm relative overflow-hidden",
            isCompleted
              ? "border-primary bg-linear-to-br from-primary to-primary/90 text-primary-foreground shadow-primary/25"
              : isActive
                ? "border-secondary bg-linear-to-br from-secondary/10 to-secondary/20 text-secondary font-bold shadow-secondary/20"
                : "border-border bg-background text-muted-foreground"
          )}
          animate={{
            scale: isActive ? 1.05 : 1,
            rotate: isCompleted ? [0, -10, 10, -10, 0] : 0
          }}
          transition={{
            scale: {
              duration: isActive ? 0.3 : 0.5,
              type: "spring",
              stiffness: 280,
              damping: 20,
            },
            rotate: {
              duration: 0.5,
              type: "tween",
              ease: "easeInOut",
            },
          }}
        >
          {isCompleted && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute inset-0 bg-primary/10 rounded-full"
            />
          )}
          {isCompleted ? (
            <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 relative z-10" />
          ) : (
            <span className="text-xs relative z-10">{index + 1}</span>
          )}
        </motion.div>
      </div>

      <div className="mt-0.5 text-center">
        <motion.p
          className={cn(
            "text-[11px] sm:text-xs font-medium transition-all max-w-[60px] sm:max-w-[80px] md:max-w-none line-clamp-2 md:line-clamp-1",
            isActive
              ? "text-secondary font-semibold"
              : isCompleted
                ? "text-primary font-medium"
                : "text-muted-foreground"
          )}
          animate={{
            scale: isActive ? 1.02 : 1,
          }}
          transition={{ duration: 0.2 }}
        >
          {title}
        </motion.p>
      </div>
    </button>
  );
};

interface StepperProps {
  steps: Array<{ title: string; description?: string; id: string }>;
  completedSteps: number[];  
  currentStep: number;
  activeSteps?: number[]; // <--- Add this
  onStepChange: (index: number) => void;
}

/**
 * Compact visual stepper — reduced vertical size while preserving original horizontal spacing.
 */
export const HorizontalStepper: React.FC<StepperProps> = ({
  steps,
  completedSteps,
  currentStep,
  activeSteps, // <--- Destructure this
  onStepChange,
}) => {
  return (
    <div className="w-full bg-linear-to-b from-background to-accent/10 border-b border-border/60 sticky top-0 z-40 shadow-sm backdrop-blur-sm">
      <div className="flex flex-row items-center justify-start sm:justify-center px-2 sm:px-4 py-1.5 sm:py-2 md:py-2 overflow-x-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent gap-0.5 sm:gap-1 md:gap-2 lg:gap-3 2xl:gap-6">
        {steps.map((step, index) => (
          <React.Fragment key={step.id}>
            <Step
              index={index}
              title={step.title}
              description={step.description}
              isCompleted={completedSteps.includes(index)}
              // Check if index is in activeSteps OR if it matches currentStep
              isActive={activeSteps ? activeSteps.includes(index) : index === currentStep}
              onClick={() => onStepChange(index)}
            />
            {index < steps.length - 1 && (
              <div className="hidden md:flex items-center mx-0.5 lg:mx-1">
                <motion.div
                  className={cn(
                    "h-0.5 w-6 lg:w-8 rounded-full transition-all",
                    completedSteps.includes(index)
                      ? "bg-linear-to-r from-primary to-primary/80"
                      : index === currentStep
                        ? "bg-linear-to-r from-secondary/60 to-secondary/30"
                        : "bg-border"
                  )}
                  animate={{
                    width: completedSteps.includes(index) ? 32 : 32,
                  }}
                />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
