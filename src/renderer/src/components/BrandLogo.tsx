import logo from '../../../../resources/branding/cerms-logo.png'

/** Adjacent CERMS text supplies the accessible brand name. */
export default function BrandLogo({ className = 'brand-symbol' }: { className?: string }) {
  return <img src={logo} className={className} alt="" aria-hidden="true" draggable={false} />
}
