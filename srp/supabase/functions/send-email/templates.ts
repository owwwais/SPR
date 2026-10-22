// Arabic applicant email templates (FR-08). Rules: respectful tone, no AI
// reasoning ever (the rejection is generic by design), RTL HTML.

export type EmailKind =
  | "application_received"
  | "interview_invited"
  | "accepted"
  | "rejected"
  | "invitation"
  // Talent platform: proves the address before any analysis is paid for.
  | "talent_verify"
  // Seeker accounts: proves the address again before an old profile is
  // linked to an account (0020, talent_issue_legacy_link).
  | "talent_link";

type TemplateInput = {
  fullName: string;
  jobTitle: string;
  refCode: string;
  trackUrl: string | null;
  companyName: string;
  /** invitation only: the one-time accept link and the offered role. */
  inviteUrl?: string | null;
  roleLabel?: string;
  /** talent_verify only: the 24-hour verification link. */
  verifyUrl?: string | null;
  /** rejected only: a neutral, human-picked reason category (#8). Optional. */
  rejectionReason?: string | null;
};

// Fixed, neutral vocabulary — matches the status_history.public_reason
// check constraint (0023). Never free text, never AI-generated: the one
// thing D24 and §10.4 both forbid is the applicant reading any evaluation
// reasoning, and a human picking from this list is the guardrail.
const REJECTION_REASON_LABELS: Record<string, string> = {
  more_suitable_candidate: "تقدّم لهذه الوظيفة مرشح رأينا توافقه معها أقرب",
  requirements_mismatch: "لم تتطابق المتطلبات الأساسية للوظيفة مع ما توفر",
  position_filled: "تم إشغال الشاغر",
  position_cancelled: "تم إلغاء هذا الشاغر",
  other: "",
};

type Template = { subject: string; html: string };

function layout(title: string, body: string, companyName: string): string {
  const footer = companyName
    ? `<p style="color:#6b7280;font-size:12px;margin-top:24px">${companyName}</p>`
    : "";
  return `<!doctype html>
<html dir="rtl" lang="ar">
  <body style="font-family:Tahoma,Arial,sans-serif;background:#f9fafb;margin:0;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;text-align:right">
      <h1 style="font-size:20px;margin:0 0 16px">${title}</h1>
      ${body}
      ${footer}
    </div>
  </body>
</html>`;
}

// The talent kinds carry a link, not an applicant or invitation record, and
// have their own builders below; this one never receives them.
export function buildEmail(
  kind: Exclude<EmailKind, "talent_verify" | "talent_link">,
  input: TemplateInput
): Template {
  switch (kind) {
    case "application_received": {
      const trackLine = input.trackUrl
        ? `<p style="margin:16px 0"><a href="${input.trackUrl}" style="color:#2563eb">تتبّع حالة طلبك من هنا</a></p>`
        : "";
      return {
        subject: `تم استلام طلبك — ${input.jobTitle}`,
        html: layout(
          "تم استلام طلبك بنجاح",
          `<p>مرحباً ${input.fullName}،</p>
           <p>نشكرك على تقديمك لوظيفة <strong>${input.jobTitle}</strong>. تم استلام طلبك وسيقوم فريق التوظيف بمراجعته.</p>
           <p>رمز المتابعة الخاص بك: <strong dir="ltr" style="font-family:monospace">${input.refCode}</strong></p>
           ${trackLine}
           <p>سنتواصل معك عبر البريد الإلكتروني عند أي تحديث على حالة طلبك.</p>`,
          input.companyName
        ),
      };
    }
    case "interview_invited": {
      const trackLine = input.trackUrl
        ? `<p style="margin:16px 0"><a href="${input.trackUrl}" style="color:#2563eb">تتبّع حالة طلبك من هنا</a></p>`
        : "";
      return {
        subject: `دعوة لمقابلة — ${input.jobTitle}`,
        html: layout(
          "دعوة لمقابلة",
          `<p>مرحباً ${input.fullName}،</p>
           <p>يسعدنا إبلاغك بأن طلبك لوظيفة <strong>${input.jobTitle}</strong> انتقل إلى مرحلة المقابلة.</p>
           <p>سيتواصل معك فريق التوظيف قريباً لتنسيق موعد المقابلة وتفاصيلها.</p>
           <p>رمز المتابعة الخاص بك: <strong dir="ltr" style="font-family:monospace">${input.refCode}</strong></p>
           ${trackLine}`,
          input.companyName
        ),
      };
    }
    case "accepted": {
      return {
        subject: `تهانينا — ${input.jobTitle}`,
        html: layout(
          "تهانينا!",
          `<p>مرحباً ${input.fullName}،</p>
           <p>يسعدنا إبلاغك بقبولك لوظيفة <strong>${input.jobTitle}</strong>. 🎉</p>
           <p>سيتواصل معك فريق التوظيف قريباً لاستكمال إجراءات التعيين والتفاصيل التالية.</p>
           <p>نتطلع لانضمامك إلينا!</p>`,
          input.companyName
        ),
      };
    }
    case "invitation": {
      // Sent to a colleague, not an applicant: no ref code, no tracking link.
      const button = input.inviteUrl
        ? `<p style="margin:24px 0"><a href="${input.inviteUrl}" style="display:inline-block;background:#2383e2;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px">قبول الدعوة</a></p>
           <p style="color:#6b7280;font-size:12px">أو انسخ هذا الرابط إلى المتصفح:<br><span dir="ltr" style="font-family:monospace;word-break:break-all">${input.inviteUrl}</span></p>`
        : "";
      return {
        subject: `دعوة للانضمام إلى فريق ${input.companyName}`,
        html: layout(
          "دعوة للانضمام",
          `<p>مرحباً،</p>
           <p>تمت دعوتك للانضمام إلى فريق التوظيف في <strong>${input.companyName}</strong>${
             input.roleLabel ? ` بصلاحية <strong>${input.roleLabel}</strong>` : ""
           }.</p>
           ${button}
           <p style="color:#6b7280;font-size:12px">تنتهي صلاحية هذه الدعوة خلال سبعة أيام. إن لم تكن تتوقع هذه الرسالة فتجاهلها.</p>`,
          input.companyName
        ),
      };
    }
    case "rejected": {
      // FR-08: respectful and generic — never any evaluation reasoning.
      // #8: an optional, neutral, HR-picked reason sentence. "other" (or no
      // reason at all) renders nothing extra, same tone as before this field
      // existed.
      const reasonLabel = input.rejectionReason
        ? REJECTION_REASON_LABELS[input.rejectionReason]
        : null;
      const reasonLine = reasonLabel
        ? `<p>${reasonLabel}.</p>`
        : "";
      return {
        subject: `تحديث بخصوص طلبك — ${input.jobTitle}`,
        html: layout(
          "شكراً لاهتمامك",
          `<p>مرحباً ${input.fullName}،</p>
           <p>نشكرك على الوقت الذي خصصته للتقديم على وظيفة <strong>${input.jobTitle}</strong> وعلى اهتمامك بالانضمام إلينا.</p>
           <p>بعد دراسة الطلبات المقدمة، قررنا المضي مع مرشحين آخرين لهذه الوظيفة.</p>
           ${reasonLine}
           <p>نقدّر جهدك ونتمنى لك كل التوفيق في مسيرتك المهنية.</p>`,
          input.companyName
        ),
      };
    }
  }
}

// Talent verification. Short on purpose: the person uploaded a CV seconds
// ago and is waiting to continue, not reading a newsletter.
export function buildTalentVerifyEmail(verifyUrl: string): Template {
  return {
    subject: "أكّد بريدك لإنشاء صفحتك المهنية",
    html: layout(
      "خطوة واحدة وتصبح صفحتك جاهزة",
      `<p style="font-size:15px;line-height:1.8;color:#374151">
         استلمنا سيرتك الذاتية. أكّد بريدك عبر الزر أدناه لنبدأ قراءتها، ثم
         تراجع ما استخرجناه قبل النشر.
       </p>
       <p style="margin:24px 0">
         <a href="${verifyUrl}"
            style="display:inline-block;background:#1c1c1c;color:#fafafa;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600">
           أكّد بريدي
         </a>
       </p>
       <p style="font-size:13px;color:#6b7280;line-height:1.8">
         الرابط صالح 24 ساعة. إن لم تكن أنت من رفع السيرة، تجاهل هذه الرسالة
         ولن يُنشَر أي شيء.
       </p>`,
      ""
    ),
  };
}

export function buildTalentLinkEmail(linkUrl: string): Template {
  return {
    subject: "اربط صفحتك المهنية بحسابك",
    html: layout(
      "طلب ربط صفحتك بحساب",
      `<p style="font-size:15px;line-height:1.8;color:#374151">
         طُلب ربط صفحتك المهنية المرتبطة بهذا البريد بحساب في المنصة. إن كنت
         أنت من طلب ذلك، افتح الرابط وأنت مسجّل الدخول في الحساب نفسه، ثم أكّد
         الربط.
       </p>
       <p style="margin:24px 0">
         <a href="${linkUrl}"
            style="display:inline-block;background:#1c1c1c;color:#fafafa;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600">
           ربط صفحتي بحسابي
         </a>
       </p>
       <p style="font-size:13px;color:#6b7280;line-height:1.8">
         الرابط صالح ساعة واحدة. إن لم تطلب الربط فتجاهل هذه الرسالة، وتبقى
         صفحتك كما هي دون أي تغيير.
       </p>`,
      ""
    ),
  };
}
