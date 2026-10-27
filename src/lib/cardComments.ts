/** Comments are on for every card unless an author turns them off. */
export const commentsOn = (card: { comments?: boolean }) => card.comments !== false;
