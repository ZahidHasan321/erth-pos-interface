import { useRef, useCallback } from "react";
import type { Path } from "react-hook-form";
import type { CustomerMeasurementsSchema } from "./measurement-form.schema";
import { AUTO_NAVIGATION_FIELDS } from "./auto-navigation-config";

/**
 * Hook to manage auto-navigation for electric tape measurement input
 * Creates refs for each field in the sequence and provides navigation handlers
 */
export function useAutoNavigation() {
  // Create refs for all auto-navigation fields
  const fieldRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());

  // Get or create ref for a field
  const getFieldRef = useCallback((fieldName: Path<CustomerMeasurementsSchema>) => {
    return (element: HTMLInputElement | null) => {
      if (element) {
        fieldRefs.current.set(fieldName, element);
      } else {
        fieldRefs.current.delete(fieldName);
      }
    };
  }, []);

  // Navigate to next field in sequence
  const navigateToNext = useCallback((currentField: Path<CustomerMeasurementsSchema>) => {
    const currentIndex = AUTO_NAVIGATION_FIELDS.indexOf(currentField);

    if (currentIndex === -1 || currentIndex === AUTO_NAVIGATION_FIELDS.length - 1) {
      // Not in sequence or last field - do nothing
      return;
    }

    // Find next available field to focus
    for (let i = currentIndex + 1; i < AUTO_NAVIGATION_FIELDS.length; i++) {
      const nextField = AUTO_NAVIGATION_FIELDS[i];
      const nextInput = fieldRefs.current.get(nextField);

      if (nextInput && !nextInput.disabled) {
        nextInput.focus();
        nextInput.select(); // Select the text for easy replacement
        break;
      }
    }
  }, []);

  // Check if a field is in the auto-navigation sequence
  const isAutoNavigationField = useCallback(
    (fieldName: Path<CustomerMeasurementsSchema>) => {
      return AUTO_NAVIGATION_FIELDS.includes(fieldName);
    },
    []
  );

  // Get handler for Enter key press
  const getEnterHandler = useCallback(
    (fieldName: Path<CustomerMeasurementsSchema>) => {
      if (!isAutoNavigationField(fieldName)) {
        return undefined;
      }
      return () => navigateToNext(fieldName);
    },
    [isAutoNavigationField, navigateToNext]
  );

  // Focus on the first field in the auto-navigation sequence
  const focusFirstField = useCallback(() => {
    if (AUTO_NAVIGATION_FIELDS.length === 0) return;

    // Find the first available field to focus
    for (const fieldName of AUTO_NAVIGATION_FIELDS) {
      const input = fieldRefs.current.get(fieldName);
      if (input && !input.disabled) {
        // Use setTimeout to ensure the field is ready and rendered
        setTimeout(() => {
          input.focus();
          input.select();
        }, 100);
        break;
      }
    }
  }, []);

  return {
    getFieldRef,
    getEnterHandler,
    isAutoNavigationField,
    focusFirstField,
  };
}
