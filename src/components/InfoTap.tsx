import React from 'react';
import { Pressable } from 'react-native';
import { appAlert } from '@/lib/dialog';
import { tapBuzz } from '@/lib/haptics';

/**
 * Делает существующую иконку/элемент источником пояснения по тапу (appAlert),
 * вместо того чтобы вешать рядом отдельную (i)-иконку. Используется там, где
 * иконка сама по себе не считывается однозначно (замочек, стрелка тренда и т.п.).
 */
export function InfoTap({
  title,
  message,
  children,
  hitSlop = 10,
}: {
  title: string;
  message?: string;
  children: React.ReactNode;
  hitSlop?: number;
}) {
  return (
    <Pressable onPress={() => { tapBuzz(); appAlert(title, message, undefined, 'info'); }} hitSlop={hitSlop}>
      {children}
    </Pressable>
  );
}
