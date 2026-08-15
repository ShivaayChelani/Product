export const EARN_REASON_MESSAGES: Record<string, string> = {
  review_write: 'Thanks for submitting a business review.',
  place_image_approved: 'Your place photo was submitted for review.',
  hidden_gem: 'Your hidden gem PalPoints were added.',
  hidden_gem_merge: 'Your hidden gem update PalPoints were added.',
  daily_login: 'Daily login PalPoints added.',
  game_complete: 'Game reward PalPoints added.',
  reel_upload: 'Thanks for uploading a reel.',
  itinerary_checkpoint: 'Itinerary checkpoint PalPoints added.',
  itinerary_completion: 'Itinerary completion PalPoints added.',
};

export function palPointsEarnMessage(reason: string): string {
  return EARN_REASON_MESSAGES[reason] || reason.replace(/_/g, ' ');
}
