// Shrink an iPad photo to a sensible size (long side 1800px, JPEG) before upload.
export async function compressPhoto(file, maxSide = 1800, quality = 0.82) {
  const img = await createImageBitmap(file).catch(async () => {
    const el = new Image()
    el.src = URL.createObjectURL(file)
    await el.decode()
    return el
  })
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * scale)
  c.height = Math.round(img.height * scale)
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  return new Promise(r => c.toBlob(r, 'image/jpeg', quality))
}
