"use client"

import * as React from "react"
import { Check, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface StepProps {
  title: string
  description?: string
  isCompleted?: boolean
  isActive?: boolean
}

const Step: React.FC<StepProps> = ({ title, description, isCompleted, isActive }) => {
  return (
    <div className="flex items-center">
      <div className="relative flex items-center justify-center">
        <div
          className={cn(
            "w-8 h-8 rounded-full border-2 flex items-center justify-center",
            isCompleted
              ? "border-primary bg-primary text-primary-foreground"
              : isActive
                ? "border-primary"
                : "border-muted",
          )}
        >
          {isCompleted ? <Check className="w-4 h-4" /> : <span className="text-sm font-medium">{title[0]}</span>}
        </div>
      </div>
      <div className="ml-4">
        <p className={cn("text-sm font-medium", isActive || isCompleted ? "text-foreground" : "text-muted-foreground")}>
          {title}
        </p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  )
}

interface StepperProps {
  steps: Array<{ title: string; description?: string }>
  currentStep: number
  completedSteps: number[]
  onStepChange: (step: number) => void
}

export function Stepper({ steps, currentStep, completedSteps, onStepChange }: StepperProps) {
  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="flex flex-col md:flex-row justify-center items-start md:items-center gap-4 mb-8">
        {steps.map((step, index) => (
          <React.Fragment key={step.title}>
            <div onClick={() => onStepChange(index)} className="cursor-pointer">
              <Step
                title={step.title}
                description={step.description}
                isCompleted={completedSteps.includes(index)}
                isActive={index === currentStep}
              />
            </div>
            {index < steps.length - 1 && <ChevronRight className="hidden md:block text-muted-foreground" />}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}