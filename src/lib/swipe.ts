/**
 * `onSwipeableWillOpen` у ReanimatedSwipeable и у legacy Swipeable отдают
 * ПРОТИВОПОЛОЖНОЕ, и на это легко наступить при миграции:
 *
 *   legacy:       toValue > 0 → 'left'   (какая ПАНЕЛЬ открылась)
 *   Reanimated:   toValue > 0 → 'right'  (куда тянули ПАЛЬЦЕМ)
 *
 * Из-за этого после перехода на ReanimatedSwipeable все свайпы стали делать
 * зеркальное действие: тянешь влево, видишь корзину из `renderRightActions`,
 * а срабатывает редактирование. Причём молча — типы совпадают, tsc чист.
 *
 * Панель всегда с противоположной стороны от направления жеста: тянем влево —
 * открывается правая. Ветвиться надо по ПАНЕЛИ (она же нарисованная иконка),
 * а не по жесту, поэтому весь код ходит через этот хелпер.
 */
export type SwipeSide = 'left' | 'right';

export function openedSide(dragDirection: SwipeSide): SwipeSide {
  return dragDirection === 'left' ? 'right' : 'left';
}
