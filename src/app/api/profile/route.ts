import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { user } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { isDisplayNameWithinLimit, normalizeDisplayName } from '@/utils/displayName';

function getConfiguredOssHost(): string | null {
  const endpoint = process.env.OSS_ENDPOINT?.trim();
  if (!endpoint) return null;

  try {
    return new URL(endpoint.startsWith('http') ? endpoint : `https://${endpoint}`).hostname;
  } catch {
    return null;
  }
}

function isAllowedAvatarUrl(avatar: string, currentAvatar?: string | null): boolean {
  if (avatar === currentAvatar) return true;
  if (avatar === '/images/default-avatar.svg') return true;
  if (avatar.startsWith('/images/')) return true;

  try {
    const avatarUrl = new URL(avatar);
    const ossHost = getConfiguredOssHost();
    const bucket = process.env.OSS_BUCKET?.trim();
    const hostAllowed =
      Boolean(ossHost && avatarUrl.hostname === ossHost) ||
      Boolean(ossHost && bucket && avatarUrl.hostname === `${bucket}.${ossHost}`);

    return hostAllowed && avatarUrl.pathname.startsWith('/avatars/');
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // 验证用户身份
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { nickname, avatar, avatarFrameId, acceptedDownloadTerms } = body;

    // 构建更新数据
    const updateData: {
      nickname?: string;
      avatar?: string;
      avatarFrameId?: number | null;
      acceptedDownloadTerms?: boolean;
    } = {};

    if (nickname !== undefined) {
      const normalizedNickname = normalizeDisplayName(nickname);

      if (normalizedNickname && !isDisplayNameWithinLimit(normalizedNickname)) {
        return NextResponse.json(
          { error: 'DISPLAY_NAME_TOO_LONG', code: 'DISPLAY_NAME_TOO_LONG' },
          { status: 400 }
        );
      }

      updateData.nickname = normalizedNickname;
    }
    if (avatar !== undefined) {
      const currentUser = await db
        .select({ avatar: user.avatar })
        .from(user)
        .where(eq(user.id, session.user.id))
        .limit(1);
      const currentAvatar = currentUser[0]?.avatar;

      if (typeof avatar !== 'string' || !avatar.trim() || !isAllowedAvatarUrl(avatar.trim(), currentAvatar)) {
        return NextResponse.json(
          { error: '头像地址无效，请重新上传头像' },
          { status: 400 }
        );
      }

      updateData.avatar = avatar.trim();
    }
    if (avatarFrameId !== undefined) {
      // 如果avatarFrameId为null，直接设置为null
      if (avatarFrameId === null) {
        updateData.avatarFrameId = null;
      } else {
        // 验证头像框ID是否为有效数字
        const frameId = typeof avatarFrameId === 'string' ? parseInt(avatarFrameId, 10) : avatarFrameId;
        if (!isNaN(frameId)) {
          updateData.avatarFrameId = frameId;
        }
      }
    }
    if (acceptedDownloadTerms !== undefined) {
      updateData.acceptedDownloadTerms = acceptedDownloadTerms;
    }

    // 更新用户信息
    await db
      .update(user)
      .set(updateData)
      .where(eq(user.id, session.user.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
