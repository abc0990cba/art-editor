# pixel-styling — Delta

## ADDED Requirements

### Requirement: Palette presets

The editor SHALL offer classic palette presets (PICO-8, Game Boy DMG, Commodore 64, Sweetie 16,
Endesga 32, and the default Classic 12), each shown with a swatch-strip preview in the color
panel, and clicking a preset SHALL apply it to the document.

#### Scenario: Apply recolors by index

- **WHEN** a document has cells painted with palette values 1–N and the user applies a preset
- **THEN** the document palette is replaced by the preset colors and each cell keeps its value,
  so its rendered color becomes the preset color at the same index (values wrap modulo the new
  palette length)

#### Scenario: Undo restores palette

- **WHEN** the user applies a preset and immediately undoes
- **THEN** the previous palette and colors are restored

#### Scenario: Round trip

- **WHEN** a project using an applied preset palette is saved and reloaded
- **THEN** the document palette is restored exactly
