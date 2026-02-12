// ===== i18n — Internationalization Module =====
// Supported locales: 'zh' (简体中文), 'en' (English)

const LOCALES = {
  zh: {
    // --- Main window: toolbar ---
    theme: '主题',
    export: '导出',
    editor: '编辑器',
    preview: '预览',
    examples: '示例',
    example_library: '示例库',
    load_example: '加载示例',
    settings: '设置',

    // --- Main window: zoom ---
    zoom_out: '缩小',
    zoom_in: '放大',
    zoom_fit: '适应窗口',
    zoom_width: '适应宽度',

    // --- Main window: export ---
    save_svg: '保存 SVG',
    save_png: '保存 PNG',
    save_pdf: '保存 PDF',
    png_quality: 'PNG 质量',
    default_marker: '默认',

    // --- Main window: status ---
    status_ready: '就绪',
    status_fallback: '回退',
    status_rendering: '渲染中…',
    status_error: '错误',

    // --- Main window: examples ---
    flowchart: '流程图',
    flowchart_desc: '带分支的决策流程',
    state_diagram: '状态图',
    state_diagram_desc: '状态机转换',
    sequence_diagram: '时序图',
    sequence_diagram_desc: '消息传递交互',
    class_diagram: '类图',
    class_diagram_desc: 'OOP 类关系',

    // --- Example library window ---
    categories: '分类',
    templates: '模板',
    search_examples: '搜索模板…',
    all_categories: '全部',
    add_category: '新增分类',
    delete_category: '删除分类',
    new_category: '新分类',
    category_name_placeholder: '输入分类名称',
    category_name_exists: '分类已存在',
    category_name_invalid: '分类名称无效',
    category_delete_blocked_nonempty: '该分类下仍有模板，无法删除',
    insert_template: '插入',
    insert_and_close: '插入并关闭',
    add_template: '新增模板',
    delete_template: '删除模板',
    confirm_delete_template: '再次点击确认删除',
    new_template: '新模板',
    edit_template: '编辑模板',
    save_template: '保存模板',
    cancel_edit: '取消',
    import_templates: '导入',
    backup_templates: '备份',
    close: '关闭',
    no_templates_found: '未找到模板',
    no_template_selected: '未选择模板',
    editing_template_hint: '正在编辑模板代码（自动保存）',
    template_name_label: '模板名称',
    template_name_placeholder: '输入模板名称',
    template_category_label: '模板分类',
    discard_template_changes: '有未保存的模板更改，确定要放弃吗？',
    import_templates_invalid: '导入文件格式无效。请使用模板数组或包含 templates 的 JSON。',
    import_templates_empty: '导入文件中没有可用模板。',
    import_templates_success: '导入模板完成',
    import_templates_failed: '导入模板失败',
    backup_templates_success: '模板备份成功',
    backup_templates_failed: '模板备份失败',

    // --- Settings window ---
    settings_title: '设置',
    settings_menu_general: '通用',
    settings_menu_editor: '编辑器',
    settings_menu_export: '导出',
    settings_menu_about: '关于',
    language: '语言',
    appearance: '外观',
    render_engine: '渲染引擎',
    render_engine_beautiful: 'bautiful-mermaid',
    render_engine_mermaid_js: 'mermaid-js/mermaid',
    theme_setting: '主题',
    interface_font_size: '界面字号',
    auto: '自动',
    light: '浅色',
    dark: '深色',
    interface_font: '界面字体',
    code_font: '代码字体',
    chart_font: '图表字体',
    default_light_chart_theme: '默认亮色图表主题',
    default_dark_chart_theme: '默认暗色图表主题',
    diagram_font: '图表字体',
    font_family: '字体',
    search_fonts: '搜索系统字体…',
    font_preview_text: '敏捷的棕色狐狸跳过了懒狗',
    no_fonts_found: '未找到字体',
    export_section: '导出',
    default_export_type: '默认导出格式',
    export_format_svg: 'SVG',
    export_format_png: 'PNG',
    export_format_pdf: 'PDF',
    png_quality_setting: 'PNG 质量',
    reset_template_library: '恢复默认模板集',
    reset_template_library_confirm: '确定恢复默认模板集吗？当前自定义模板将被替换。',
    reset_template_library_success: '已恢复默认模板集',
    about_and_copyright: '关于与版权',
    copyright_line_app: 'Mermaid Studio',
    copyright_line_version: '版本 0.8.0',
    copyright_line_owner: 'Copyright © 2026 Woody. All rights reserved.',
    copyright_line_notice: '第三方依赖遵循其各自许可证。',
  },

  en: {
    // --- Main window: toolbar ---
    theme: 'Theme',
    export: 'Export',
    editor: 'Editor',
    preview: 'Preview',
    examples: 'Examples',
    example_library: 'Example Library',
    load_example: 'Load Example',
    settings: 'Settings',

    // --- Main window: zoom ---
    zoom_out: 'Zoom Out',
    zoom_in: 'Zoom In',
    zoom_fit: 'Fit Window',
    zoom_width: 'Fit Width',

    // --- Main window: export ---
    save_svg: 'Save SVG',
    save_png: 'Save PNG',
    save_pdf: 'Save PDF',
    png_quality: 'PNG Quality',
    default_marker: 'Default',

    // --- Main window: status ---
    status_ready: 'Ready',
    status_fallback: 'Fallback',
    status_rendering: 'Rendering…',
    status_error: 'Error',

    // --- Main window: examples ---
    flowchart: 'Flowchart',
    flowchart_desc: 'Decision flow with branching',
    state_diagram: 'State Diagram',
    state_diagram_desc: 'State machine transitions',
    sequence_diagram: 'Sequence Diagram',
    sequence_diagram_desc: 'Message passing interactions',
    class_diagram: 'Class Diagram',
    class_diagram_desc: 'OOP class relationships',

    // --- Example library window ---
    categories: 'Categories',
    templates: 'Templates',
    search_examples: 'Search templates…',
    all_categories: 'All',
    add_category: 'Add Category',
    delete_category: 'Delete Category',
    new_category: 'New Category',
    category_name_placeholder: 'Enter category name',
    category_name_exists: 'Category already exists',
    category_name_invalid: 'Invalid category name',
    category_delete_blocked_nonempty: 'Category still contains templates',
    insert_template: 'Insert',
    insert_and_close: 'Insert & Close',
    add_template: 'Add Template',
    delete_template: 'Delete Template',
    confirm_delete_template: 'Click again to confirm delete',
    new_template: 'New Template',
    edit_template: 'Edit Template',
    save_template: 'Save Template',
    cancel_edit: 'Cancel',
    import_templates: 'Import',
    backup_templates: 'Backup',
    close: 'Close',
    no_templates_found: 'No templates found',
    no_template_selected: 'No template selected',
    editing_template_hint: 'Editing template code (auto-save)',
    template_name_label: 'Template Name',
    template_name_placeholder: 'Enter template name',
    template_category_label: 'Template Category',
    discard_template_changes: 'You have unsaved template changes. Discard them?',
    import_templates_invalid: 'Invalid import file format. Use a template array or JSON with templates.',
    import_templates_empty: 'No valid templates found in the imported file.',
    import_templates_success: 'Templates imported',
    import_templates_failed: 'Failed to import templates',
    backup_templates_success: 'Template backup saved',
    backup_templates_failed: 'Failed to backup templates',

    // --- Settings window ---
    settings_title: 'Settings',
    settings_menu_general: 'General',
    settings_menu_editor: 'Editor',
    settings_menu_export: 'Export',
    settings_menu_about: 'About',
    language: 'Language',
    appearance: 'Appearance',
    render_engine: 'Render Engine',
    render_engine_beautiful: 'bautiful-mermaid',
    render_engine_mermaid_js: 'mermaid-js/mermaid',
    theme_setting: 'Theme',
    interface_font_size: 'Interface Font Size',
    auto: 'Auto',
    light: 'Light',
    dark: 'Dark',
    interface_font: 'Interface Font',
    code_font: 'Code Font',
    chart_font: 'Chart Font',
    default_light_chart_theme: 'Default Light Chart Theme',
    default_dark_chart_theme: 'Default Dark Chart Theme',
    diagram_font: 'Diagram Font',
    font_family: 'Font Family',
    search_fonts: 'Search system fonts…',
    font_preview_text: 'The quick brown fox jumps over the lazy dog',
    no_fonts_found: 'No fonts found',
    export_section: 'Export',
    default_export_type: 'Default Export Type',
    export_format_svg: 'SVG',
    export_format_png: 'PNG',
    export_format_pdf: 'PDF',
    png_quality_setting: 'PNG Quality',
    reset_template_library: 'Reset Template Library',
    reset_template_library_confirm: 'Reset to the default template set? Your custom templates will be replaced.',
    reset_template_library_success: 'Template library reset to defaults',
    about_and_copyright: 'About & Copyright',
    copyright_line_app: 'Mermaid Studio',
    copyright_line_version: 'Version 0.8.0',
    copyright_line_owner: 'Copyright © 2026 Woody. All rights reserved.',
    copyright_line_notice: 'Third-party dependencies remain under their respective licenses.',
  },
};

const DEFAULT_LOCALE = 'zh';

/**
 * Get the current locale from localStorage
 * @returns {'zh'|'en'}
 */
export function getLocale() {
  const saved = localStorage.getItem('locale');
  if (saved && LOCALES[saved]) return saved;
  return DEFAULT_LOCALE;
}

/**
 * Set the current locale and persist to localStorage
 * @param {'zh'|'en'} locale
 */
export function setLocale(locale) {
  if (!LOCALES[locale]) return;
  localStorage.setItem('locale', locale);
}

/**
 * Translate a key using the current locale
 * @param {string} key
 * @returns {string}
 */
export function t(key) {
  const locale = getLocale();
  return LOCALES[locale]?.[key] ?? LOCALES[DEFAULT_LOCALE]?.[key] ?? key;
}

/**
 * Apply translations to all elements with data-i18n attributes within a root.
 * - data-i18n="key"         → sets textContent
 * - data-i18n-title="key"   → sets title attribute
 * - data-i18n-placeholder="key" → sets placeholder attribute
 * @param {Document|Element} root
 */
export function applyI18n(root) {
  // Text content
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });

  // Title attribute
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.title = t(key);
  });

  // Placeholder attribute
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.placeholder = t(key);
  });
}
