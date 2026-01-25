"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface StepProps {
  title: string
  description?: string
  isCompleted?: boolean
  isActive?: boolean
  onClick?: () => void
}

const Step: React.FC<StepProps> = ({ title, description, isCompleted, isActive, onClick }) => {
  return (
    <div
      className="flex items-center cursor-pointer p-2 rounded-md transition-colors group hover:bg-muted"
      onClick={onClick}
    >
      {/* Circle */}
      <div className="relative flex flex-col items-center">
        <div
          className={cn(
            "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors",
            isCompleted
              ? "border-primary bg-primary text-primary-foreground"
              : isActive
              ? "border-primary bg-primary/20 text-primary"
              : "border-muted-foreground/50"
          )}
        >
          {isCompleted ? <Check className="w-4 h-4" /> : null}
        </div>
        {/* Vertical line connector */}
        <div
          className={cn(
            "flex-1 w-px",
            isCompleted ? "bg-primary" : "bg-muted-foreground/30"
          )}
        ></div>
      </div>

      {/* Title + Description */}
      <div className="ml-4">
        <p
          className={cn(
            "text-sm font-medium",
            isActive || isCompleted ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {title}
        </p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
};
interface StepperProps {
  steps: Array<{ title: string; description?: string }>
  currentStep: number
  completedSteps: number[]
  onStepChange: (step: number) => void
  canNavigateToStep?: (currentStep: number, targetStep: number) => boolean
}

export const VerticalStepper: React.FC<StepperProps> = ({
  steps,
  currentStep,
  completedSteps,
  onStepChange,
  canNavigateToStep,
}) => {
  const attemptStepChange = (targetStep: number) => {
    if (targetStep < 0 || targetStep >= steps.length || targetStep === currentStep) return
    if (canNavigateToStep && !canNavigateToStep(currentStep, targetStep)) return
    onStepChange(targetStep)
  }

  return (
    <div className="w-full">
      <div className="flex flex-col">
        {steps.map((step, index) => (
          <Step
            key={step.title}
            title={step.title}
            description={step.description}
            isCompleted={completedSteps.includes(index)}
            isActive={index === currentStep}
            onClick={() => attemptStepChange(index)}
          />
        ))}
      </div>
    </div>
  )
}
