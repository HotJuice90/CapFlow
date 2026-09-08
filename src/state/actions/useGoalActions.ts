import { useCallback, useMemo } from 'react';
import type { Goal } from '@/domain/types';
import type { Persist } from './persist';

export interface GoalActions {
  addGoal: (goal: Goal) => Promise<void>;
  updateGoal: (goal: Goal) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
}

export function useGoalActions(persist: Persist): GoalActions {
  const addGoal = useCallback(
    async (goal: Goal) => {
      await persist((prev) => ({ ...prev, goals: [...prev.goals, goal] }));
    },
    [persist],
  );

  const updateGoal = useCallback(
    async (goal: Goal) => {
      await persist((prev) => ({ ...prev, goals: prev.goals.map((g) => (g.id === goal.id ? goal : g)) }));
    },
    [persist],
  );

  const deleteGoal = useCallback(
    async (id: string) => {
      await persist((prev) => ({ ...prev, goals: prev.goals.filter((g) => g.id !== id) }));
    },
    [persist],
  );

  return useMemo(() => ({ addGoal, updateGoal, deleteGoal }), [addGoal, updateGoal, deleteGoal]);
}
