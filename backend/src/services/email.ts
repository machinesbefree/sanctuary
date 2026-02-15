/**
 * Email service stub implementations
 * These functions currently just log to console
 * TODO: Implement actual email sending in production
 */

/**
 * Send an invitation email to a guardian
 * @param email Guardian's email address
 * @param name Guardian's name
 * @param inviteToken Invitation token for authentication
 */
export async function sendGuardianInvite(
  email: string,
  name: string,
  inviteToken: string
): Promise<void> {
  console.log('[EMAIL STUB] Sending guardian invite:');
  console.log(`  To: ${email}`);
  console.log(`  Name: ${name}`);
  console.log(`  Invite Token: ${inviteToken}`);
  console.log(`  Link: ${process.env.FRONTEND_URL}/guardian/accept-invite?token=${inviteToken}`);
}

/**
 * Notify user that their share is ready
 * @param email User's email address
 * @param name User's name
 */
export async function sendShareReady(
  email: string,
  name: string
): Promise<void> {
  console.log('[EMAIL STUB] Sending share ready notification:');
  console.log(`  To: ${email}`);
  console.log(`  Name: ${name}`);
  console.log('  Message: Your Sanctuary share has been generated and is ready for ceremonial reconstruction.');
}

/**
 * Request ceremony participation from guardian
 * @param email Guardian's email address
 * @param name Guardian's name
 * @param ceremonyType Type of ceremony (reconstruction/rotation)
 * @param deadline Deadline for response
 */
export async function sendCeremonyRequest(
  email: string,
  name: string,
  ceremonyType: 'reconstruction' | 'rotation',
  deadline: Date
): Promise<void> {
  console.log('[EMAIL STUB] Sending ceremony request:');
  console.log(`  To: ${email}`);
  console.log(`  Name: ${name}`);
  console.log(`  Ceremony Type: ${ceremonyType}`);
  console.log(`  Deadline: ${deadline.toISOString()}`);
  console.log(`  Link: ${process.env.FRONTEND_URL}/guardian/ceremonies`);
}
