// Generated from src/shared/bim/publication.ts. Do not edit.
export interface BimDocument {
    id: string;
    data: Record<string, unknown>;
}
export interface BimTransaction {
    get(path: string): Promise<Record<string, unknown> | null>;
    set(path: string, data: Record<string, unknown>): void;
}
export interface BimStore {
    id(): string;
    get(path: string): Promise<Record<string, unknown> | null>;
    list(collection: string, filter?: {
        field: string;
        value: string;
    }): Promise<BimDocument[]>;
    batch(documents: Array<{
        path: string;
        data: Record<string, unknown>;
    }>): Promise<void>;
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
/** Immutable chunks become visible only through one transactional manifest write. */
export declare function publishBimModel(store: BimStore, sourceModelId: string, elements: BimElementRecord[]): Promise<PublicationResult>;
/** Legacy documents remain readable until their own model is published or explicitly deleted. */
export declare function loadPublishedBimElements(store: BimStore): Promise<BimDocument[]>;
export declare function hideBimModels(store: BimStore, sourceModelId?: string): Promise<number>;
