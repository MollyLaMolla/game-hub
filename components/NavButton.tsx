export default function NavButton({
  icon,
  text,
  btnStyle,
  textStyle,
  link,
  bgColor,
  iconPosition,
}: {
  icon: React.ReactNode
  text: string
  btnStyle?: string
  textStyle?: string
  link?: string
  bgColor?: string
  iconPosition?: 'left' | 'right'
}) {
  return (
    <a
      className={`flex items-center justify-center w-fit ${btnStyle || 'px-4 py-2 gap-2 rounded-lg'} ${(bgColor && bgColor) || 'bg-primary-0'} cursor-pointer`}
      href={(link && link) || 'https://www.youtube.com/'}
    >
      <div
        className={`${iconPosition === 'left' || iconPosition === undefined ? 'order-1' : 'order-3'}`}
      >
        {icon}
      </div>
      <p className={`order-2 ${textStyle || ''}`}>{text}</p>
    </a>
  )
}
