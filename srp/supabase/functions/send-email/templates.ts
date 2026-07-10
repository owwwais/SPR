// Arabic applicant email templates (FR-08). Rules: respectful tone, no AI
// reasoning ever (the rejection is generic by design), RTL HTML.

export type EmailKind =
  | "application_received"
  | "interview_invited"
  | "rejected";

type TemplateInput = {
  fullName: string;
  jobTitle: string;
  refCode: string;
  trackUrl: string | null;
  companyName: string;
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

export function buildEmail(
  kind: EmailKind,
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
    case "rejected": {
      // FR-08: respectful and generic — never any evaluation reasoning.
      return {
        subject: `تحديث بخصوص طلبك — ${input.jobTitle}`,
        html: layout(
          "شكراً لاهتمامك",
          `<p>مرحباً ${input.fullName}،</p>
           <p>نشكرك على الوقت الذي خصصته للتقديم على وظيفة <strong>${input.jobTitle}</strong> وعلى اهتمامك بالانضمام إلينا.</p>
           <p>بعد دراسة الطلبات المقدمة، قررنا المضي مع مرشحين آخرين لهذه الوظيفة.</p>
           <p>نقدّر جهدك ونتمنى لك كل التوفيق في مسيرتك المهنية.</p>`,
          input.companyName
        ),
      };
    }
  }
}
