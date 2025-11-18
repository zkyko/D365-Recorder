import * as fs from 'fs';
import * as path from 'path';
import { PageRegistry, PageRegistryEntry, PageIdentity } from '../../types';
import { makePageClassName } from '../utils/identifiers';

/**
 * Manages the page registry - a JSON file that tracks all discovered D365 pages
 */
export class PageRegistryManager {
  private registryPath: string;
  private registry: PageRegistry = {};

  constructor(registryPath: string = 'Recordings/page-registry.json') {
    this.registryPath = registryPath;
    this.loadRegistry();
  }

  /**
   * Load registry from disk
   */
  private loadRegistry(): void {
    try {
      if (fs.existsSync(this.registryPath)) {
        const content = fs.readFileSync(this.registryPath, 'utf-8');
        this.registry = JSON.parse(content);
      }
    } catch (error) {
      console.error('Error loading page registry:', error);
      this.registry = {};
    }
  }

  /**
   * Save registry to disk
   */
  private saveRegistry(): void {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.registryPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.registryPath, JSON.stringify(this.registry, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving page registry:', error);
    }
  }

  /**
   * Register or update a page identity
   */
  registerPage(identity: PageIdentity, module?: string): PageRegistryEntry {
    // Map PageIdentity type to PageClassification pattern for makePageClassName
    const typeToPattern: Record<PageIdentity['type'], 'ListPage' | 'DetailsPage' | 'Dialog' | 'Workspace' | 'SimpleList' | 'TableOfContents' | 'Unknown'> = {
      'list': 'ListPage',
      'details': 'DetailsPage',
      'dialog': 'Dialog',
      'workspace': 'Workspace',
      'unknown': 'Unknown',
    };
    
    const pattern = typeToPattern[identity.type] || 'Unknown';
    
    // Generate className from pageId or caption
    const className = makePageClassName(identity.caption || identity.pageId, pattern);

    // Generate file path
    const modulePath = module ? path.join('d365', module) : 'd365';
    const fileName = this.pageIdToFileName(identity.pageId);
    const filePath = path.join('Recordings', 'pages', modulePath, `${fileName}.page.js`);

    const entry: PageRegistryEntry = {
      ...identity,
      className,
      filePath,
    };

    // Store by pageId
    this.registry[identity.pageId] = entry;

    // Also store by mi if available (for quick lookup)
    if (identity.mi) {
      this.registry[`mi:${identity.mi}`] = entry;
    }

    this.saveRegistry();
    return entry;
  }

  /**
   * Get registry entry by pageId
   */
  getPage(pageId: string): PageRegistryEntry | undefined {
    return this.registry[pageId];
  }

  /**
   * Get registry entry by mi parameter
   */
  getPageByMi(mi: string): PageRegistryEntry | undefined {
    return this.registry[`mi:${mi}`];
  }

  /**
   * Get all registered pages
   */
  getAllPages(): PageRegistry {
    return { ...this.registry };
  }

  /**
   * Convert pageId to file name
   */
  private pageIdToFileName(pageId: string): string {
    return pageId
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '')
      .replace(/-page$/, '');
  }
}

