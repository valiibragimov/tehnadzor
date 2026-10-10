// Generated from src/shared/bim/publication.ts. Do not edit.
export interface BimDocument {
    id: string;
    data: Record<string, unknown>;
}
export interface BimTransaction {
    get(path: string): Promise<Record<string, unknown> | null>;
    set(path: string, data: Record<string, unknown>): void;
    delete(path: string): void;
}
export interface BimPageOptions {
    filter?: {
        field: string;
        value: string;
    };
    after?: string;
    limit: number;
}
export interface BimStore {
    id(): string;
    timestamp(): unknown;
    get(path: string): Promise<Record<string, unknown> | null>;
    list(collection: string, filter?: {
        field: string;
        value: string;
    }): Promise<BimDocument[]>;
    page(collection: string, options: BimPageOptions): Promise<BimDocument[]>;
    batch(documents: Array<{
        path: string;
        data: Record<string, unknown>;
    }>, guard?: (transaction: BimTransaction) => Promise<void>): Promise<void>;
    transaction<T>(action: (transaction: BimTransaction) => Promise<T>): Promise<T>;
}
export interface BimElementRecord {
    elementId: string;
    sourceModelId: string;
    [key: string]: unknown;
}
export interface PublicationResult {
    writtenCount: number;
    removedCount: number;
}
/** Every staging chunk is fenced against cleanup and delayed writers. */
export declare function publishBimModel(store: BimStore, sourceModelId: string, elements: BimElementRecord[]): Promise<PublicationResult>;
/** Pins one catalog version across publication/deletion. Discard partial pages if iteration fails. */
export declare function readPublishedBimPages(store: BimStore, pageSize?: number): AsyncGenerator<BimDocument[]>;
export declare function loadPublishedBimElements(store: BimStore): Promise<BimDocument[]>;
export declare function hideBimModels(store: BimStore, sourceModelId?: string): Promise<number>;
/** Run from trusted maintenance infrastructure. Unknown pre-migration generations are retained. */
export declare function collectBimGenerations(store: BimStore, options?: {
    now?: number;
    retentionMs?: number;
    stagingMs?: number;
}): Promise<{
    generations: number;
    elements: number;
}>;
