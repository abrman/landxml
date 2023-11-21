const downloadGlb = (glbData: Uint8Array, fileName: string) => {
  const blobUrl = URL.createObjectURL(new Blob([glbData], { type: "model/gltf-binary" }));
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
};

export default downloadGlb;
