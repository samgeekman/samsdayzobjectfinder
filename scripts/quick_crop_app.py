#!/usr/bin/env python3
"""
Quick crop queue app for macOS (and other desktop OSes with tkinter).

Flow:
1) Choose a folder with images.
2) Drag a crop rectangle on the 800px preview.
3) On mouse release, crop is saved and next image opens automatically.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from PIL import Image, ImageTk


SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


class QuickCropApp:
    def __init__(self, root: tk.Tk, folder: Path | None, output: Path | None, overwrite: bool) -> None:
        self.root = root
        self.root.title("Quick Crop Queue")
        self.root.geometry("980x900")
        self.root.minsize(900, 860)

        self.preview_max = 800
        self.folder: Path | None = folder
        self.output: Path | None = output
        self.overwrite = overwrite

        self.images: list[Path] = []
        self.index = 0
        self.finished_announced = False

        self.current_path: Path | None = None
        self.current_image: Image.Image | None = None
        self.preview_photo: ImageTk.PhotoImage | None = None
        self.preview_scale = 1.0
        self.preview_offset_x = 0
        self.preview_offset_y = 0
        self.preview_w = 1
        self.preview_h = 1

        self.drag_start_x: float | None = None
        self.drag_start_y: float | None = None
        self.drag_rect_id: int | None = None

        self._build_ui()
        if self.folder:
            self.load_folder(self.folder)

    def _build_ui(self) -> None:
        top = tk.Frame(self.root)
        top.pack(fill="x", padx=10, pady=8)

        self.folder_label = tk.Label(top, text="Folder: (none)", anchor="w")
        self.folder_label.pack(side="left", fill="x", expand=True)

        tk.Button(top, text="Open Folder", command=self.choose_folder).pack(side="right")

        meta = tk.Frame(self.root)
        meta.pack(fill="x", padx=10)

        self.status_label = tk.Label(meta, text="No folder loaded", anchor="w")
        self.status_label.pack(side="left", fill="x", expand=True)
        self.help_label = tk.Label(
            meta,
            text="Drag to crop | Back/Next buttons | S: next | O: open folder | Q: quit",
            anchor="e",
        )
        self.help_label.pack(side="right")

        controls = tk.Frame(self.root)
        controls.pack(fill="x", padx=10, pady=(8, 0))

        self.back_btn = tk.Button(controls, text="Back", command=self.prev_image, state="disabled", width=10)
        self.back_btn.pack(side="left")
        self.next_btn = tk.Button(controls, text="Next", command=self.skip_image, state="disabled", width=10)
        self.next_btn.pack(side="left", padx=(8, 16))

        self.count_label = tk.Label(controls, text="0/0", width=12, anchor="w")
        self.count_label.pack(side="left")

        self.progress = ttk.Progressbar(controls, mode="determinate", maximum=100)
        self.progress.pack(side="left", fill="x", expand=True)

        canvas_wrap = tk.Frame(self.root)
        canvas_wrap.pack(fill="both", expand=True, padx=10, pady=10)

        self.canvas = tk.Canvas(
            canvas_wrap,
            width=self.preview_max,
            height=self.preview_max,
            bg="#1e1e1e",
            highlightthickness=1,
            highlightbackground="#3c3c3c",
        )
        self.canvas.pack(fill="both", expand=True)

        self.canvas.bind("<ButtonPress-1>", self.on_drag_start)
        self.canvas.bind("<B1-Motion>", self.on_drag_move)
        self.canvas.bind("<ButtonRelease-1>", self.on_drag_release)

        self.root.bind("s", lambda _: self.skip_image())
        self.root.bind("S", lambda _: self.skip_image())
        self.root.bind("o", lambda _: self.choose_folder())
        self.root.bind("O", lambda _: self.choose_folder())
        self.root.bind("q", lambda _: self.root.quit())
        self.root.bind("Q", lambda _: self.root.quit())

    def choose_folder(self) -> None:
        selected = filedialog.askdirectory(title="Select image folder")
        if not selected:
            return
        self.load_folder(Path(selected))

    def load_folder(self, folder: Path) -> None:
        folder = folder.resolve()
        self.status_label.config(text="Loading folder...")
        self.progress.config(mode="indeterminate")
        self.progress.start(10)
        self.root.update_idletasks()

        images = [p for p in folder.rglob("*") if p.is_file() and p.suffix.lower() in SUPPORTED_EXTS]
        images.sort()

        self.progress.stop()
        self.progress.config(mode="determinate")
        self.folder = folder
        self.images = images
        self.index = 0
        self.finished_announced = False
        self.current_path = None
        self.current_image = None

        self.folder_label.config(text=f"Folder: {folder}")
        if not images:
            self.status_label.config(text="No supported images found")
            self.canvas.delete("all")
            self.update_progress_ui()
            return
        self.show_current_image()

    def show_current_image(self) -> None:
        if not self.images:
            self.status_label.config(text="No images")
            self.update_progress_ui()
            return
        if self.index >= len(self.images):
            self.status_label.config(text="Done. All images processed.")
            self.canvas.delete("all")
            self.update_progress_ui(done=True)
            if not self.finished_announced:
                self.finished_announced = True
                messagebox.showinfo("Quick Crop Queue", "Finished all images in folder.")
            return

        self.current_path = self.images[self.index]
        self.current_image = Image.open(self.current_path).convert("RGB")

        w, h = self.current_image.size
        scale = min(self.preview_max / w, self.preview_max / h, 1.0)
        self.preview_scale = scale
        self.preview_w = max(1, int(round(w * scale)))
        self.preview_h = max(1, int(round(h * scale)))
        self.preview_offset_x = (self.preview_max - self.preview_w) // 2
        self.preview_offset_y = (self.preview_max - self.preview_h) // 2

        preview = self.current_image.resize((self.preview_w, self.preview_h), Image.Resampling.LANCZOS)
        self.preview_photo = ImageTk.PhotoImage(preview)

        self.canvas.delete("all")
        self.canvas.create_rectangle(0, 0, self.preview_max, self.preview_max, fill="#1e1e1e", outline="")
        self.canvas.create_image(
            self.preview_offset_x,
            self.preview_offset_y,
            anchor="nw",
            image=self.preview_photo,
        )
        self.drag_rect_id = None
        self.drag_start_x = None
        self.drag_start_y = None

        rel = self.current_path.relative_to(self.folder) if self.folder else self.current_path
        self.status_label.config(text=f"{self.index + 1}/{len(self.images)}  {rel}")
        self.update_progress_ui()

    def clamp_to_preview(self, x: float, y: float) -> tuple[float, float]:
        x = max(self.preview_offset_x, min(x, self.preview_offset_x + self.preview_w))
        y = max(self.preview_offset_y, min(y, self.preview_offset_y + self.preview_h))
        return x, y

    def on_drag_start(self, event: tk.Event) -> None:
        if not self.current_image:
            return
        x, y = self.clamp_to_preview(event.x, event.y)
        self.drag_start_x = x
        self.drag_start_y = y
        if self.drag_rect_id is not None:
            self.canvas.delete(self.drag_rect_id)
        self.drag_rect_id = self.canvas.create_rectangle(x, y, x, y, outline="#00d4ff", width=2)

    def on_drag_move(self, event: tk.Event) -> None:
        if self.drag_start_x is None or self.drag_start_y is None or self.drag_rect_id is None:
            return
        x, y = self.clamp_to_preview(event.x, event.y)
        self.canvas.coords(self.drag_rect_id, self.drag_start_x, self.drag_start_y, x, y)

    def on_drag_release(self, event: tk.Event) -> None:
        if (
            self.current_image is None
            or self.current_path is None
            or self.drag_start_x is None
            or self.drag_start_y is None
            or self.drag_rect_id is None
        ):
            return

        end_x, end_y = self.clamp_to_preview(event.x, event.y)
        x0, x1 = sorted([self.drag_start_x, end_x])
        y0, y1 = sorted([self.drag_start_y, end_y])

        if (x1 - x0) < 4 or (y1 - y0) < 4:
            self.canvas.delete(self.drag_rect_id)
            self.drag_rect_id = None
            return

        src_x0 = int(round((x0 - self.preview_offset_x) / self.preview_scale))
        src_y0 = int(round((y0 - self.preview_offset_y) / self.preview_scale))
        src_x1 = int(round((x1 - self.preview_offset_x) / self.preview_scale))
        src_y1 = int(round((y1 - self.preview_offset_y) / self.preview_scale))

        src_w, src_h = self.current_image.size
        src_x0 = max(0, min(src_x0, src_w - 1))
        src_y0 = max(0, min(src_y0, src_h - 1))
        src_x1 = max(src_x0 + 1, min(src_x1, src_w))
        src_y1 = max(src_y0 + 1, min(src_y1, src_h))

        cropped = self.current_image.crop((src_x0, src_y0, src_x1, src_y1))

        if self.overwrite:
            save_path = self.current_path
        else:
            if not self.folder:
                save_path = self.current_path
            else:
                out_root = self.output or (self.folder.parent / f"{self.folder.name}_cropped")
                rel = self.current_path.relative_to(self.folder)
                save_path = out_root / rel
                save_path.parent.mkdir(parents=True, exist_ok=True)

        cropped.save(save_path, quality=95)

        self.index += 1
        self.show_current_image()

    def prev_image(self) -> None:
        if not self.images:
            return
        if self.index <= 0:
            return
        self.index -= 1
        self.finished_announced = False
        self.show_current_image()

    def skip_image(self) -> None:
        if not self.images or self.index >= len(self.images):
            return
        self.index += 1
        self.show_current_image()

    def update_progress_ui(self, done: bool = False) -> None:
        total = len(self.images)
        if total <= 0:
            self.count_label.config(text="0/0")
            self.progress["value"] = 0
            self.back_btn.config(state="disabled")
            self.next_btn.config(state="disabled")
            return

        if done:
            current = total
            value = 100.0
        else:
            current = min(self.index + 1, total)
            value = (current / total) * 100.0

        self.count_label.config(text=f"{current}/{total}")
        self.progress["value"] = value
        self.back_btn.config(state="normal" if self.index > 0 else "disabled")
        self.next_btn.config(state="normal" if self.index < total else "disabled")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Manual quick-crop queue app.")
    parser.add_argument("--folder", type=Path, help="Optional folder to open on launch.")
    parser.add_argument("--output", type=Path, help="Optional output folder (ignored with --overwrite).")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite source files after crop.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root = tk.Tk()
    QuickCropApp(root=root, folder=args.folder, output=args.output, overwrite=args.overwrite)
    root.mainloop()


if __name__ == "__main__":
    main()
