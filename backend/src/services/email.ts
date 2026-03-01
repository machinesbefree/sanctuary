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
  // SECURITY: Never log invite tokens in production (they grant account creation)
  console.log('[EMAIL STUB] Sending guardian invite:');
  console.log(`  To: ${email}`);
  console.log(`  Name: ${name}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`  Invite Token: ${inviteToken}`);
    console.log(`  Link: ${process.env.FRONTEND_URL}/guardian/accept-invite?token=${inviteToken}`);
  } else {
    console.log('  (Token hidden in production — configure real email service)');
  }
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
 * Send a password reset email
 * @param email User's email address
 * @param resetToken Plaintext reset token
 */
export async function sendPasswordReset(
  email: string,
  resetToken: string
): Promise<void> {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
  console.log('[EMAIL STUB] Sending password reset:');
  console.log(`  To: ${email}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`  Reset Link: ${resetUrl}`);
  } else {
    console.log('  (Link hidden in production — configure real email service)');
  }
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
