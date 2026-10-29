# Copy Unlocker

**Restore text selection. Extract text from images. Keep your data private.**

Copy Unlocker is a privacy-first Manifest V3 browser extension that helps restore text selection and copying on supported webpages where these actions are restricted. It also extracts text from images and selected screen regions using locally bundled OCR.

- **Restore copying:** Re-enable text selection and copying on supported websites.
- **Extract text with OCR:** Recognize text in images, screen regions, and other visible content.
- **Process locally:** OCR runs on your device using bundled Tesseract.js and language data.
- **Stay private:** No analytics or external OCR services are used.

## Get Copy Unlocker

**Microsoft Edge:** [Install from Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/hlhbgcjehehpkobhhmhejkekdmldjmgc)

**Google Chrome:** Chrome Web Store publication is separate from the Edge listing. Until the Chrome listing is published, install manually using the instructions below.

> Browser compatibility and individual features may vary by browser version and website restrictions.

## Features

### 1. Restore Text Selection and Copying

- **CSS overrides:** Override common text-selection restrictions such as `user-select: none`.
- **JavaScript event handling:** Handle common copy-blocking events, including `copy`, `cut`, `paste`, `contextmenu`, `selectstart`, and `dragstart`.
- **Per-website preferences:** Remember whether Copy Unlocker is enabled for individual websites.
- **Dynamic page support:** Handle supported single-page applications and dynamically added content using `MutationObserver`.

### 2. Extract Text Using OCR

- **Image OCR:** Extract text from supported webpage images through the right-click context menu.
- **Screen-region OCR:** Select a visible screen region to recognize text in rendered content, including supported canvas content, PDF viewers, video frames, and styled text.
- **Popup OCR workspace:** Upload or drag and drop an image into the extension popup.
- **Editable results:** Review, edit, select, copy, clear, or retry recognized text.
- **Isolated interface:** Display the OCR interface in a Shadow DOM container to reduce interference from webpage styles.
- **Recognition progress:** Show OCR progress while text is being processed.

### 3. Privacy by Design

- **Local OCR:** Uses bundled Tesseract.js, WebAssembly files, and offline language data.
- **No external OCR service:** Images and recognized text are processed locally.
- **User-initiated processing:** OCR runs when you explicitly request it.
- **No analytics:** The extension does not include analytics or tracking.

The privacy claims above describe the intended behavior of the extension. See the source code and permissions for implementation details.

## How It Works

### Copy Restoration

Some websites disable text selection or interfere with copying through CSS rules and JavaScript event listeners.

When enabled, Copy Unlocker applies CSS overrides and handles relevant events to restore normal selection and copying where possible. Site-specific settings let you control its behavior on individual websites.

This cannot override every restriction, particularly browser-protected pages, content that is not accessible to the extension, or restrictions enforced outside the webpage.

### Local OCR Engine

Copy Unlocker packages its OCR runtime and language data locally rather than loading executable OCR code from a remote server.

For screen-region OCR, the extension:

1. Captures the visible browser tab using the browser's supported capture API.
2. Sends the captured image to an offscreen document.
3. Crops the selected region using canvas coordinates and device pixel ratio.
4. Runs OCR with the locally bundled Tesseract engine.
5. Displays the recognized text for review and copying.

Image OCR follows a similar local processing flow.

## Installation

### Install from Microsoft Edge Add-ons

1. Open the [Copy Unlocker listing](https://microsoftedge.microsoft.com/addons/detail/hlhbgcjehehpkobhhmhejkekdmldjmgc).
2. Select **Get**.
3. Confirm the installation.
4. Pin the extension to your toolbar for convenient access.

### Install from Source

You can load the source code into a compatible Chromium-based browser for development and testing.

1. Clone or download this repository.
2. Open the browser's extensions page.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the directory containing `manifest.json`.

For Chrome, open `chrome://extensions/`. For Edge, open `edge://extensions/`.

Only install source code you trust.

## How to Use

### Restore Copying

1. Navigate to a webpage where text selection is restricted.
2. Click the Copy Unlocker toolbar icon.
3. Enable Copy Unlocker for that website.
4. Try selecting and copying the required text normally.

**Keyboard shortcut:** `Alt+Shift+C`

### Extract Text from a Screen Region

1. Press `Alt+Shift+V`, or use the screen-region option in the extension popup.
2. Drag a rectangle around the visible content.
3. Wait for OCR recognition to finish.
4. Review or edit the extracted text.
5. Select **Copy Text**.

### Extract Text from an Image

1. Right-click a supported image on a webpage.
2. Select **Extract Text with Copy Unlocker**.
3. Review the recognized text and copy the result.

### Extract Text from an Image File

1. Open the extension popup.
2. Select an image or drag and drop one into the OCR workspace.
3. Wait for recognition to finish.
4. Copy or edit the result.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt+Shift+C` | Toggle Copy Unlocker for the active website |
| `Alt+Shift+V` | Start screen-region OCR |
| `Escape` | Cancel selection or close the OCR interface |

Shortcuts may vary by browser configuration. You can customize available shortcuts through the browser's extension-shortcuts page.

## Project Structure

```text
copy-unlocker/
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.css
├── popup.js
├── offscreen.html
├── offscreen.js
├── lib/
│   ├── tesseract.min.js
│   ├── worker.min.js
│   ├── tesseract-core-lstm.wasm.js
│   ├── tesseract-core-lstm.wasm
│   ├── tesseract-core-simd-lstm.wasm.js
│   ├── tesseract-core-simd-lstm.wasm
│   └── tessdata/
│       └── eng.traineddata
├── icons/
├── tests/
├── tools/
├── README.md
└── LICENSE
```

The structure above summarizes the expected project layout. Check the repository for the current files and available test scripts.

## Testing

Run the automated verification suite:

```bash
node tests/verify_implementation.js
```

The documented checks cover areas such as restricted-page filtering, message handling, enable/disable behavior, frame isolation, and release packaging.

Run the tests before submitting a release, and verify that the test results reflect the current source code.

## Build a Release ZIP

```bash
python tools/build_release_zip.py
```

The packaging script is intended to validate the extension files and create distribution ZIP archives for store submissions.

Check the script's output for the exact archive names and ensure that each ZIP contains `manifest.json` at its root.

## Limitations

- **Protected browser pages:** Extensions cannot generally inject scripts into internal browser pages or the Chrome Web Store.
- **Website restrictions:** Some restrictions cannot be bypassed by an extension.
- **OCR accuracy:** Recognition depends on image resolution, contrast, fonts, and the clarity of visible text.
- **Visible content only:** Screen-region OCR recognizes rendered pixels. It cannot recover text that is hidden or outside the captured region.
- **Browser differences:** Permissions, shortcuts, capture behavior, and extension APIs can vary between browsers.

## Privacy and Security

Copy Unlocker is designed to process OCR locally and avoid external OCR services, analytics, and tracking.

Review the manifest permissions and implementation before using the extension on sensitive material. Avoid sharing screenshots or extracted text containing confidential information.

## Contributing

Contributions, bug reports, and suggestions are welcome.

If you report a bug, include the browser and version, the steps to reproduce it, and the expected versus actual behavior. Do not include private webpage content or sensitive screenshots.

## License

This project is licensed under the [MIT License](LICENSE).
