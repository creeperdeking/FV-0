declare module "@jscad/stl-serializer" {
  export const mimeType: string;
  export function serialize(
    options: { binary?: boolean; statusCallback?: (status: { progress: number }) => void },
    ...objects: unknown[]
  ): ArrayBuffer[] | string[];
}
