// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use pdf_writer::{Content, Finish, Name, Pdf, Rect, Ref, TextStr};
use resvg::tiny_skia::Transform;
use serde::Deserialize;
use std::collections::{BTreeSet, HashMap};
use svg2pdf::{usvg, ConversionOptions};
#[cfg(target_os = "macos")]
use tauri::menu::{MenuBuilder, MenuItem, SubmenuBuilder};
#[cfg(target_os = "macos")]
use tauri::Emitter;

#[cfg(target_os = "macos")]
const MENU_OPEN_SETTINGS_ID: &str = "open_settings";
#[cfg(target_os = "macos")]
const OPEN_SETTINGS_EVENT: &str = "open-settings-window";
const POINTS_PER_INCH: f32 = 72.0;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn list_system_fonts() -> Vec<String> {
    let mut db = usvg::fontdb::Database::new();
    db.load_system_fonts();
    let families: BTreeSet<String> = db
        .faces()
        .filter_map(|face| face.families.first().map(|(name, _)| name.clone()))
        .collect();
    families.into_iter().collect()
}

#[tauri::command]
fn svg_to_pdf(svg: String, options: Option<SvgToPdfOptions>) -> Result<Vec<u8>, String> {
    let config = options.unwrap_or_default();
    let mut usvg_options = usvg::Options::default();
    usvg_options.fontdb_mut().load_system_fonts();
    if let Some(font_family) = config
        .preferred_font_family
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        usvg_options.font_family = font_family.to_string();
    }
    let tree = usvg::Tree::from_str(&svg, &usvg_options).map_err(|e| e.to_string())?;

    let source_width_pt = svg_units_to_points(tree.size().width(), config.dpi);
    let source_height_pt = svg_units_to_points(tree.size().height(), config.dpi);
    if !(source_width_pt > 0.0 && source_height_pt > 0.0) {
        return Err("SVG has invalid dimensions".to_string());
    }

    let raster_scale = config.raster_scale.clamp(1.0, 8.0);
    let margin_pt = config.page_margin_pt.max(0.0);
    let (page_width_pt, page_height_pt, scale) = select_best_layout(
        source_width_pt,
        source_height_pt,
        config.page_width_pt.max(POINTS_PER_INCH),
        config.page_height_pt.max(POINTS_PER_INCH),
        margin_pt,
    );

    let draw_width_pt = source_width_pt * scale;
    let draw_height_pt = source_height_pt * scale;
    let offset_x_pt = (page_width_pt - draw_width_pt) * 0.5;
    let offset_y_pt = (page_height_pt - draw_height_pt) * 0.5;

    let (svg_chunk, svg_root_ref) = svg2pdf::to_chunk(
        &tree,
        ConversionOptions {
            raster_scale,
            ..ConversionOptions::default()
        },
    )
    .map_err(|e| e.to_string())?;

    let mut alloc = Ref::new(1);
    let catalog_ref = alloc.bump();
    let page_tree_ref = alloc.bump();
    let page_ref = alloc.bump();
    let content_ref = alloc.bump();
    let document_info_ref = alloc.bump();
    let svg_name = Name(b"S1");

    let mut id_map: HashMap<Ref, Ref> = HashMap::new();
    let svg_chunk = svg_chunk.renumber(|old| *id_map.entry(old).or_insert_with(|| alloc.bump()));
    let svg_ref = id_map
        .get(&svg_root_ref)
        .copied()
        .ok_or_else(|| "Failed to map SVG reference".to_string())?;

    let mut pdf = Pdf::new();
    pdf.catalog(catalog_ref).pages(page_tree_ref);
    pdf.pages(page_tree_ref).count(1).kids([page_ref]);

    let mut page = pdf.page(page_ref);
    page.parent(page_tree_ref);
    page.media_box(Rect::new(0.0, 0.0, page_width_pt, page_height_pt));
    page.contents(content_ref);
    let mut resources = page.resources();
    resources.x_objects().pair(svg_name, svg_ref);
    resources.finish();
    page.finish();

    let mut content = Content::new();
    if let Some([r, g, b]) = config.page_background_rgb {
        content.save_state();
        content.set_fill_rgb(r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0);
        content.rect(0.0, 0.0, page_width_pt, page_height_pt);
        content.fill_nonzero();
        content.restore_state();
    }
    content.save_state();
    content.transform([
        draw_width_pt,
        0.0,
        0.0,
        draw_height_pt,
        offset_x_pt,
        offset_y_pt,
    ]);
    content.x_object(svg_name);
    content.restore_state();

    pdf.stream(content_ref, &content.finish());
    pdf.extend(&svg_chunk);
    pdf.document_info(document_info_ref)
        .producer(TextStr("Mermaid Studio"));

    Ok(pdf.finish())
}

#[tauri::command]
fn svg_to_png(svg: String, options: Option<SvgToPngOptions>) -> Result<Vec<u8>, String> {
    let config = options.unwrap_or_default();
    let mut usvg_options = usvg::Options::default();
    usvg_options.fontdb_mut().load_system_fonts();
    if let Some(font_family) = config
        .preferred_font_family
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        usvg_options.font_family = font_family.to_string();
    }
    let tree = usvg::Tree::from_str(&svg, &usvg_options).map_err(|e| e.to_string())?;
    let scale = config.raster_scale.clamp(1.0, 8.0);
    let width_px = (tree.size().width() * scale).round().max(1.0) as u32;
    let height_px = (tree.size().height() * scale).round().max(1.0) as u32;

    let mut pixmap = resvg::tiny_skia::Pixmap::new(width_px, height_px)
        .ok_or_else(|| "Failed to allocate PNG pixmap".to_string())?;
    let mut pixmap_mut = pixmap.as_mut();
    resvg::render(&tree, Transform::from_scale(scale, scale), &mut pixmap_mut);
    pixmap.encode_png().map_err(|e| e.to_string())
}

fn svg_units_to_points(svg_units: f32, dpi: f32) -> f32 {
    let safe_dpi = dpi.clamp(POINTS_PER_INCH, 300.0);
    svg_units * POINTS_PER_INCH / safe_dpi
}

fn fit_scale(
    source_width: f32,
    source_height: f32,
    page_width: f32,
    page_height: f32,
    margin: f32,
) -> f32 {
    let safe_margin = margin
        .min(page_width * 0.49)
        .min(page_height * 0.49)
        .max(0.0);
    let available_width = (page_width - safe_margin * 2.0).max(1.0);
    let available_height = (page_height - safe_margin * 2.0).max(1.0);
    let width_scale = available_width / source_width.max(1e-6);
    let height_scale = available_height / source_height.max(1e-6);
    width_scale.min(height_scale)
}

fn select_best_layout(
    source_width: f32,
    source_height: f32,
    base_page_width: f32,
    base_page_height: f32,
    margin: f32,
) -> (f32, f32, f32) {
    let portrait_scale = fit_scale(
        source_width,
        source_height,
        base_page_width,
        base_page_height,
        margin,
    );
    let landscape_scale = fit_scale(
        source_width,
        source_height,
        base_page_height,
        base_page_width,
        margin,
    );

    if landscape_scale > portrait_scale {
        (base_page_height, base_page_width, landscape_scale)
    } else {
        (base_page_width, base_page_height, portrait_scale)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SvgToPdfOptions {
    #[serde(default = "default_pdf_raster_scale")]
    raster_scale: f32,
    #[serde(default = "default_pdf_dpi")]
    dpi: f32,
    preferred_font_family: Option<String>,
    page_background_rgb: Option<[u8; 3]>,
    #[serde(default = "default_pdf_page_width_pt")]
    page_width_pt: f32,
    #[serde(default = "default_pdf_page_height_pt")]
    page_height_pt: f32,
    #[serde(default = "default_pdf_page_margin_pt")]
    page_margin_pt: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SvgToPngOptions {
    #[serde(default = "default_png_raster_scale")]
    raster_scale: f32,
    preferred_font_family: Option<String>,
}

impl Default for SvgToPdfOptions {
    fn default() -> Self {
        Self {
            raster_scale: default_pdf_raster_scale(),
            dpi: default_pdf_dpi(),
            preferred_font_family: None,
            page_background_rgb: None,
            page_width_pt: default_pdf_page_width_pt(),
            page_height_pt: default_pdf_page_height_pt(),
            page_margin_pt: default_pdf_page_margin_pt(),
        }
    }
}

impl Default for SvgToPngOptions {
    fn default() -> Self {
        Self {
            raster_scale: default_png_raster_scale(),
            preferred_font_family: None,
        }
    }
}

fn default_pdf_raster_scale() -> f32 {
    4.0
}

fn default_png_raster_scale() -> f32 {
    2.0
}

fn default_pdf_dpi() -> f32 {
    96.0
}

fn default_pdf_page_width_pt() -> f32 {
    612.0
}

fn default_pdf_page_height_pt() -> f32 {
    792.0
}

fn default_pdf_page_margin_pt() -> f32 {
    36.0
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            svg_to_pdf,
            svg_to_png,
            list_system_fonts
        ]);

    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(|app| {
            let settings_item = MenuItem::with_id(
                app,
                MENU_OPEN_SETTINGS_ID,
                "Settings…",
                true,
                Some("CmdOrCtrl+,"),
            )?;

            let app_menu = SubmenuBuilder::new(app, &app.package_info().name)
                .about(None)
                .separator()
                .item(&settings_item)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            let window_menu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .maximize()
                .fullscreen()
                .separator()
                .close_window()
                .build()?;

            MenuBuilder::new(app)
                .item(&app_menu)
                .item(&edit_menu)
                .item(&window_menu)
                .build()
        })
        .on_menu_event(|app, event| {
            if event.id() == MENU_OPEN_SETTINGS_ID {
                let _ = app.emit_to("main", OPEN_SETTINGS_EVENT, ());
            }
        });

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
