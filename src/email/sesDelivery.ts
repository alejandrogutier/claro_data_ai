import AWS from "aws-sdk";
import { env } from "../config/env";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sesv2 = new AWS.SESV2({ region: env.awsRegion });

type SesAccountMode = {
  productionAccessEnabled: boolean;
  sendingEnabled: boolean;
  isSandbox: boolean;
  sendQuota: {
    max24HourSend: number | null;
    maxSendRate: number | null;
    sentLast24Hours: number | null;
  };
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const accountCacheTtlMs = 5 * 60 * 1000;
let accountCache: CacheEntry<SesAccountMode> | null = null;

const identityCache = new Map<string, boolean>();

const clampString = (value: string, max = 320): string => value.trim().slice(0, max);

export const normalizeRecipients = (recipients: string[]): string[] => {
  const normalized = recipients
    .map((value) => clampString(value).toLowerCase())
    .filter((value) => value.length > 0 && EMAIL_REGEX.test(value));
  return [...new Set(normalized)];
};

export const getSesMode = async (): Promise<SesAccountMode> => {
  const now = Date.now();
  if (accountCache && accountCache.expiresAt > now) {
    return accountCache.value;
  }

  const response = await sesv2.getAccount({}).promise();
  const productionAccessEnabled = response.ProductionAccessEnabled === true;
  const sendingEnabled = response.SendingEnabled === true;
  const sendQuota = response.SendQuota ?? {};

  const mode: SesAccountMode = {
    productionAccessEnabled,
    sendingEnabled,
    isSandbox: !productionAccessEnabled,
    sendQuota: {
      max24HourSend: typeof sendQuota.Max24HourSend === "number" ? sendQuota.Max24HourSend : null,
      maxSendRate: typeof sendQuota.MaxSendRate === "number" ? sendQuota.MaxSendRate : null,
      sentLast24Hours: typeof sendQuota.SentLast24Hours === "number" ? sendQuota.SentLast24Hours : null
    }
  };

  accountCache = { value: mode, expiresAt: now + accountCacheTtlMs };
  return mode;
};

const isEmailIdentityVerified = async (email: string): Promise<boolean> => {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  if (identityCache.has(normalized)) {
    return identityCache.get(normalized) ?? false;
  }

  try {
    const response = await sesv2
      .getEmailIdentity({
        EmailIdentity: normalized
      })
      .promise();
    const verified = response.VerifiedForSendingStatus === true;
    identityCache.set(normalized, verified);
    return verified;
  } catch {
    identityCache.set(normalized, false);
    return false;
  }
};

export const filterForSandbox = async (recipients: string[]): Promise<string[]> => {
  const normalized = normalizeRecipients(recipients);
  const verified: string[] = [];

  for (const email of normalized) {
    if (await isEmailIdentityVerified(email)) {
      verified.push(email);
    }
  }

  return verified;
};

export const resolveRecipientsForDelivery = async (
  recipients: string[]
): Promise<{ recipients: string[]; isSandbox: boolean; sendingEnabled: boolean; productionAccessEnabled: boolean }> => {
  const normalized = normalizeRecipients(recipients);
  const mode = await getSesMode();
  if (normalized.length === 0) {
    return {
      recipients: [],
      isSandbox: mode.isSandbox,
      sendingEnabled: mode.sendingEnabled,
      productionAccessEnabled: mode.productionAccessEnabled
    };
  }
  if (mode.isSandbox) {
    const filtered = await filterForSandbox(normalized);
    return {
      recipients: filtered,
      isSandbox: true,
      sendingEnabled: mode.sendingEnabled,
      productionAccessEnabled: mode.productionAccessEnabled
    };
  }

  return {
    recipients: normalized,
    isSandbox: false,
    sendingEnabled: mode.sendingEnabled,
    productionAccessEnabled: mode.productionAccessEnabled
  };
};

export const getNotificationEmailStatus = async (
  senderEmail: string | null
): Promise<{
  productionAccessEnabled: boolean;
  sendingEnabled: boolean;
  sendQuota: SesAccountMode["sendQuota"];
  senderEmail: string | null;
  senderVerificationStatus: string | null;
  senderVerifiedForSending: boolean;
}> => {
  const mode = await getSesMode();

  const normalizedSender = senderEmail ? clampString(senderEmail).toLowerCase() : null;
  if (!normalizedSender) {
    return {
      productionAccessEnabled: mode.productionAccessEnabled,
      sendingEnabled: mode.sendingEnabled,
      sendQuota: mode.sendQuota,
      senderEmail: null,
      senderVerificationStatus: null,
      senderVerifiedForSending: false
    };
  }

  try {
    const identity = await sesv2
      .getEmailIdentity({
        EmailIdentity: normalizedSender
      })
      .promise();

    return {
      productionAccessEnabled: mode.productionAccessEnabled,
      sendingEnabled: mode.sendingEnabled,
      sendQuota: mode.sendQuota,
      senderEmail: normalizedSender,
      senderVerificationStatus: typeof identity.VerificationStatus === "string" ? identity.VerificationStatus : null,
      senderVerifiedForSending: identity.VerifiedForSendingStatus === true
    };
  } catch {
    return {
      productionAccessEnabled: mode.productionAccessEnabled,
      sendingEnabled: mode.sendingEnabled,
      sendQuota: mode.sendQuota,
      senderEmail: normalizedSender,
      senderVerificationStatus: null,
      senderVerifiedForSending: false
    };
  }
};
