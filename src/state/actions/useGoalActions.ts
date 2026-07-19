import { useCallback, useMemo } from 'react';
import type { Goal } from '@/domain/types';
import type { AppData } from '@/storage/types';

export interface GoalActions {
  addGoal: (goal: Goal) => Promise<void>;
  updateGoal: (goal: Goal) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
}

export function useGoalActions(data: AppData, persist: (next: AppData) => Promise<void>): GoalActions {
  const addGoal = useCallback(
    async (goal: Goal) => {
      await persist({ ...data, goals: [...data.goals, goal] });
    },
    [data, persist],
  );

  const updateGoal = useCallback(
    async (goal: Goal) => {
      await persist({ ...data, goals: data.goals.map((g) => (g.id === goal.id ? goal : g)) });
    },
    [data, persist],
  );

  const deleteGoal = useCallback(
    async (id: string) => {
      await persist({ ...data, goals: data.goals.filter((g) => g.id !== id) });
    },
    [data, persist],
  );

  return useMemo(() => ({ addGoal, updateGoal, deleteGoal }), [addGoal, updateGoal, deleteGoal]);
}
