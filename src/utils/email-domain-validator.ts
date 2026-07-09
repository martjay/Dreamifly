import { db } from '@/db';
import { allowedEmailDomain } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

const blockedEmailDomains = [
  'fixscal.com',
  'tempforward.com',
  'arigo.site',
  'arthiq.world',
  'maildy.site',
  'hitbase.net',
  'ilustrosonic.com',
  'fivan.store',
  'p-668.top',
  'trungtampccc.vn',
  'porhantek.shop',
  'nexshinz.app',
  'kantclass.com',
  'scatterteam.com',
  'newbreedapps.com',
  'edumomtalk.com',
  'dsdfg-dsfg.info',
  'lovevista.lat',
  'capcutpro.click',
  'bnrlner.shop',
  'vmvzzmv.shop',
  'edufirst.sbs',
  'dienmayvietvan.com',
  'kiras.fun',
  'vrijspelen.be',
  'cocoting.space',
  'baonguyenshop.com',
  'xongin.online',
  'tantang.store',
  'taoxao.online',
  'luxgan.store',
  'kingerta.shop',
  'sogon.site',
  'sayaga.space',
  'tigigo.site',
  'sasi-inc.org',
  'newssourceai.com',
  'alf5.com',
  'tikwel.com',
  'muskarm.com',
  'swftbars.com',
  'taoxe.com',
  'workpolo.com',
  '4nly.com',
  'trepolan.com',
  'mtupu.com',
  'matkind.com',
  'ifcoat.com',
  'hitzcart.com',
  'googxs.com',
  'doreact.com',
  'acg.box',
  'simfatic.com',
  'onion-rush.buzz',
  'counselsys.com',
  'shortapk.com',
  'savdz.com',
  'seolaner.com',
  'boraboratech.com',
  'viawoo.com',
  'bittnex.com',
  'web5h.com',
  'westecom.com',
  'okcpress.com',
  'nuitx.com',
  'nriza.com',
  'noyavip.com',
  'marineso.com',
  'gzeos.com',
  'ameady.com',
  'anythingthat.org',
  'kingofwebdesign.com',
  'sd.yourselvoes.com',
  'coalportlogistics.com',
  'tokoub.com',
  'vektoru.com',
  'upipaid.com',
  'redtion.com',
  'tkonu.com',
  'topkute.com',
  'homvela.com',
  'getasail.com',
  'dardr.com',
  'acanok.com',
  'bitmah.com',
  'hidevak.com',
  'itquoted.com',
  'veedraw.com',
  'renakol.com',
  'lesote.com',
  'xspiel.com',
  'shagni.com',
  'yyxxi.com',
  'eubonus.com',
  'jparksky.com',
  'ixospace.com',
  'feanzier.com',
  'atinjo.com',
  'gopicta.com',
  'imfaya.com',
  'akixpres.com',
  'markuto.com',
  'kenotown.com',
  'rewtaxi.com',
  'trocipad.com',
  'wfibb.com',
  'kurstore.com',
];

/**
 * 从邮箱地址中提取域名
 */
export function extractDomainFromEmail(email: string): string | null {
  const parts = email.split('@');
  if (parts.length !== 2) {
    return null;
  }
  return parts[1].toLowerCase();
}

/**
 * 验证邮箱域名是否命中临时邮箱黑名单
 */
export function isBlockedEmailDomain(email: string): boolean {
  const domain = extractDomainFromEmail(email);
  if (!domain) {
    return false;
  }

  return blockedEmailDomains.some((blockedDomain) => {
    return domain === blockedDomain || domain.endsWith(`.${blockedDomain}`);
  });
}

/**
 * 验证邮箱域名是否在允许列表中且已启用
 */
export async function isEmailDomainAllowed(email: string): Promise<boolean> {
  const domain = extractDomainFromEmail(email);
  if (!domain) {
    return false;
  }

  try {
    const result = await db
      .select()
      .from(allowedEmailDomain)
      .where(
        and(
          eq(allowedEmailDomain.domain, domain),
          eq(allowedEmailDomain.isEnabled, true)
        )
      )
      .limit(1);

    return result.length > 0;
  } catch (error) {
    console.error('Error checking email domain:', error);
    return false;
  }
}

/**
 * 验证163邮箱格式：只允许纯数字+@163.com
 * @param email 邮箱地址
 * @returns 如果是163邮箱且格式正确（纯数字）返回true，否则返回false
 */
export function isValid163Email(email: string): boolean {
  const domain = extractDomainFromEmail(email);
  if (domain !== '163.com') {
    return true; // 不是163邮箱，不在此处验证
  }

  // 提取@前面的部分
  const parts = email.split('@');
  if (parts.length !== 2) {
    return false;
  }

  const localPart = parts[0];
  // 检查是否只包含数字
  return /^\d+$/.test(localPart);
}

/**
 * 验证 Google 邮箱本地部分的点号数量，拦截 3 个及以上点号
 * @param email 邮箱地址
 * @param maxDots @ 前允许的最大点号数量，默认 2
 */
export function isEmailDotCountAllowed(email: string, maxDots = 2): boolean {
  const domain = extractDomainFromEmail(email);
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') {
    return true;
  }

  const parts = email.split('@');
  if (parts.length !== 2) {
    return false;
  }

  const localPart = parts[0];
  const dotCount = (localPart.match(/\./g) || []).length;
  return dotCount <= maxDots;
}

/**
 * 验证 Gmail 别名邮箱，拦截本地部分包含 + 的地址
 * @param email 邮箱地址
 */
export function isGmailPlusAliasEmail(email: string): boolean {
  const domain = extractDomainFromEmail(email);
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') {
    return false;
  }

  const parts = email.split('@');
  if (parts.length !== 2) {
    return false;
  }

  const localPart = parts[0];
  return localPart.includes('+');
}

/**
 * 获取所有启用的邮箱域名列表
 */
export async function getAllowedEmailDomains(): Promise<string[]> {
  try {
    const result = await db
      .select({ domain: allowedEmailDomain.domain })
      .from(allowedEmailDomain)
      .where(eq(allowedEmailDomain.isEnabled, true));

    return result.map((r) => r.domain);
  } catch (error) {
    console.error('Error fetching allowed email domains:', error);
    return [];
  }
}

