import * as fs from 'fs';
import * as path from 'path';
import { GeneratedFile } from '../types';

/**
 * Handles file writing and optional code formatting
 */
export class CodeFormatter {
  /**
   * Write generated files to disk
   */
  writeFiles(files: GeneratedFile[]): void {
    for (const file of files) {
      // Ensure directory exists
      const dir = path.dirname(file.path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write file
      fs.writeFileSync(file.path, file.content, 'utf-8');
      console.log(`Generated: ${file.path}`);
    }
  }

  /**
   * Format code (optional - can integrate Prettier later)
   */
  formatCode(content: string): string {
    // Basic formatting - can be enhanced with Prettier
    // For now, just ensure consistent line endings
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  /**
   * Check if file exists and handle conflicts
   */
  handleFileConflict(filePath: string, strategy: 'overwrite' | 'append' | 'skip' = 'overwrite'): boolean {
    if (!fs.existsSync(filePath)) {
      return true; // File doesn't exist, safe to write
    }

    if (strategy === 'skip') {
      return false; // Skip existing files
    }

    if (strategy === 'append') {
      // Could implement append logic here
      return true;
    }

    // Default: overwrite
    return true;
  }
}

