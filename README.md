# D365 Auto-Recorder & POM Generator

A desktop application for recording Dynamics 365 Finance & Operations user interactions and automatically generating Playwright Page Object Models (POMs) and test specifications.

## Features

- **Interactive Recording**: Record user interactions in D365 using Playwright
- **Smart Locator Extraction**: Automatically extracts stable locators following POM guidelines
- **Page Classification**: Intelligently groups interactions by D365 form patterns
- **Code Generation**: Generates JavaScript POM classes and Playwright test specs
- **Idempotent Generation**: Avoids duplicate methods and fields when regenerating

## Architecture

- **Desktop Shell**: Electron-based desktop application
- **Frontend**: React UI for session management and step review
- **Core Engine**: Node.js backend with Playwright integration
- **Code Generators**: POM and test spec generators following D365 POM Design Guidelines

## Project Structure

```
AutoRecorder/
├── src/
│   ├── main/              # Electron main process
│   ├── core/              # Application core (session, recorder, locators)
│   ├── generators/        # POM and spec generators
│   └── ui/                # React frontend
├── config/                # Configuration files
└── dist/                  # Compiled output
```

## Setup

1. Install dependencies:
```bash
npm run install:all
```

2. Build the project:
```bash
npm run build
npm run build:ui
```

3. Run the application:
```bash
npm start
```

## Development

There are two ways to run in development mode:

**Option 1: Built UI (Recommended for testing)**
- `npm run build:all` - Build everything
- `npm run dev:electron` - Run Electron with built UI

**Option 2: Dev Server (Recommended for UI development)**
- Terminal 1: `npm run dev:ui` - Start Vite dev server (port 5173)
- Terminal 2: `npm run dev:electron` - Run Electron (will connect to dev server)

**Other commands:**
- `npm run dev:watch` - Watch mode for TypeScript compilation
- `npm run build` - Build TypeScript only
- `npm run build:ui` - Build React UI only

## Usage

1. **Setup Session**: Enter flow name, module, and D365 URL
2. **Start Recording**: Click "Start Recording" to launch browser
3. **Perform Actions**: Interact with D365 in the browser window
4. **Review Steps**: Review and edit captured steps
5. **Generate Code**: Configure output paths and generate POM + test files

## Output

Generated files follow the D365 POM Design Guidelines:

- `pages/d365/{module}/{page-name}.page.js` - POM classes
- `tests/d365/{module}/{flow-name}.generated.spec.js` - Test specs

## License

MIT

