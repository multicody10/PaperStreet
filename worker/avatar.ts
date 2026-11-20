// All avatar URLs are constructed from IDs verified by Discord, never from client-supplied URLs.
export function discordAvatarUrl(userId: string, hash: string | null | undefined, discriminator?: string | null): string {
  if (!/^\d{15,22}$/.test(userId)) throw new Error('Invalid Discord user ID');
  const avatarHash = typeof hash === 'string' ? hash.toLowerCase() : '';
  if (/^(?:a_)?[a-f0-9]{32}$/.test(avatarHash)) {
    const extension = avatarHash.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${extension}?size=128`;
  }
  const index = discriminator && /^\d{4}$/.test(discriminator) && discriminator !== '0000'
    ? Number(discriminator) % 5
    : Number((BigInt(userId) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}
