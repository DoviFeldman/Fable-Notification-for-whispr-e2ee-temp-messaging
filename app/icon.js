import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div style={{
      fontSize: 290,
      background: '#111111',
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#cccccc',
      borderRadius: 90,
    }}>
      w
    </div>,
    { width: 512, height: 512 }
  )
}
