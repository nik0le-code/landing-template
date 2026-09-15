/** Options accepted in modules.config.ts: `example: { enabled: true, options: { … } }`. */
export interface ExampleOptions {
  /** Maximum messages listed on the example page. */
  pageSize: number;
}

export const exampleDefaults: ExampleOptions = { pageSize: 20 };

declare module "@/modules/types" {
  interface ModuleOptionsMap {
    example: ExampleOptions;
  }
}
