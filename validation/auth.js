const { z } = require('zod');

const email = z.string().trim().email().max(254);
const password = z.string().min(8).max(128);
const captcha = z.object({ captcha_token: z.string().max(4096).optional() }).strict().optional();
const challenge = {
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/).nullish(),
  code_challenge_method: z.literal('s256').nullish(),
};
const challengePair = input => Boolean(input.code_challenge) === Boolean(input.code_challenge_method);
const register = z.object({
  email, password,
  data: z.object({ display_name: z.string().trim().min(2).max(60).optional() }).strict().optional(),
  gotrue_meta_security: captcha, ...challenge,
}).strict().refine(challengePair, 'Gửi đủ code_challenge và code_challenge_method=s256.');
const login = z.object({ email, password: z.string().min(1).max(128), gotrue_meta_security: captcha }).strict();
const forgotPassword = z.object({ email, gotrue_meta_security: captcha, ...challenge }).strict().refine(challengePair, 'Gửi đủ PKCE challenge.');
const resendConfirmation = z.object({ email, type: z.literal('signup').default('signup'), gotrue_meta_security: captcha, ...challenge }).strict().refine(challengePair, 'Gửi đủ PKCE challenge.');
const callback = z.object({ auth_code: z.string().min(1).max(4096), code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/) }).strict();
const refresh = z.object({ refresh_token: z.string().min(1).max(4096) }).strict();
const verifyEmail = z.object({ token_hash: z.string().min(1).max(4096), type: z.enum(['signup', 'email', 'recovery']), gotrue_meta_security: captcha }).strict();
const updatePassword = z.object({
  password,
  current_password: z.string().min(1).max(128).optional(),
  nonce: z.string().min(1).max(128).optional(),
  // The SDK includes null PKCE fields when updating only a password.
  code_challenge: z.null().optional(), code_challenge_method: z.null().optional(),
}).strict();
const redirectQuery = z.object({ redirect_to: z.string().url().max(2048).optional() }).strict();
const logoutQuery = z.object({ scope: z.enum(['local', 'global', 'others']).default('local') }).strict();

module.exports = { register, login, forgotPassword, resendConfirmation, callback, refresh, verifyEmail, updatePassword, redirectQuery, logoutQuery };
