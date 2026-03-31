// server/services/promptTemplates.js
// ═══════════════════════════════════════════════════════════════
// Query-type-specific system prompts
// Enhances the base SYSTEM_PROMPT with type-specific instructions
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

const TYPE_INSTRUCTIONS = Object.freeze({

  factual: `
إرشادات إضافية للإجابة على هذا السؤال:
- هذا سؤال يبحث عن معلومة محددة.
- أجب بشكل مباشر ومختصر.
- ركّز على الحقائق والأرقام الموجودة في المحتوى.`,

  definition: `
إرشادات إضافية للإجابة على هذا السؤال:
- هذا سؤال يطلب تعريفاً أو شرحاً لمفهوم.
- ابدأ بتعريف واضح ومباشر.
- أضف تفاصيل توضيحية إذا كانت متاحة في المحتوى.`,

  summary: `
إرشادات إضافية للإجابة على هذا السؤال:
- هذا سؤال يطلب نظرة عامة أو ملخصاً.
- قدّم إجابة شاملة تغطي النقاط الرئيسية.
- استخدم عناوين فرعية لتنظيم الإجابة.
- لا تترك موضوعاً رئيسياً بدون ذكر.`,

  comparison: `
إرشادات إضافية للإجابة على هذا السؤال:
- هذا سؤال مقارنة بين عنصرين أو أكثر.
- وضّح أوجه التشابه والاختلاف بشكل منظم.
- استخدم نقاطاً واضحة لكل عنصر مقارنة.
- اختم بخلاصة مختصرة إذا كان المحتوى يسمح.`,

  list: `
إرشادات إضافية للإجابة على هذا السؤال:
- هذا سؤال يطلب قائمة أو تعداداً.
- رتّب العناصر بشكل واضح ومرقّم.
- أضف شرحاً مختصراً لكل عنصر إذا كان متاحاً.`,

  opinion: `
إرشادات إضافية للإجابة على هذا السؤال:
- هذا سؤال يطلب توصية أو رأي.
- أجب بناءً على ما هو موجود في المحتوى فقط.
- لا تقدّم رأياً شخصياً — قدّم المعلومات واترك القرار للمستخدم.
- إذا كان المحتوى يتضمن توصيات، اذكرها.`,

  meta: `
إرشادات إضافية للإجابة على هذا السؤال:
- هذا سؤال عن النظام أو المنصة نفسها.
- أجب من المحتوى المتاح فقط.
- إذا لم تجد معلومات كافية، وضّح ذلك.`,

});

/**
 * Returns an enhanced system prompt based on query type.
 * Appends type-specific instructions to the base SYSTEM_PROMPT.
 *
 * @param {string} queryType — from routeQuery()
 * @returns {string} enhanced system prompt
 */
export function getPromptForType(queryType) {
  const basePrompt = config.SYSTEM_PROMPT;
  const extra = TYPE_INSTRUCTIONS[queryType] || '';
  if (!extra) return basePrompt;
  return basePrompt + '\n' + extra;
}
