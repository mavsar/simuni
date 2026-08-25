import { cva, cx, type VariantProps } from 'class-variance-authority';
import {
  createContext,
  useContext,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from 'react';

/**
 * Predefined icon size for every tab. Defining a tab only requires passing the
 * icon component itself — the size is applied here, never by the caller.
 */
const TAB_ICON_SIZE = 18;

/** Any icon component that accepts the usual lucide-style props. */
type TabIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

const tabListVariants = cva('inline-flex items-center', {
  variants: {
    variant: {
      underline: 'gap-6 sm:gap-8',
      pill: 'gap-1 rounded-full bg-white/15 p-1 backdrop-blur-md ring-1 ring-white/25',
      solid: 'gap-1 rounded-xl bg-white/85 p-1 shadow-sm ring-1 ring-brand/10',
    },
    size: {
      sm: 'text-xs',
      md: 'text-sm',
      lg: 'text-base',
    },
  },
  defaultVariants: {
    variant: 'underline',
    size: 'md',
  },
});

/*
 * The `underline` variant mirrors the camping-simuni.hr navigation: an ::after
 * bar that starts off-screen to the left (-101%) and slides in to 0% on hover
 * and when active, clipped by the tab's own overflow-hidden. Easing matches the
 * site's `cubic-bezier(0.39, 0.575, 0.565, 1)` over 300ms.
 */
const tabVariants = cva(
  'relative inline-flex items-center gap-2 font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        underline: [
          'overflow-hidden px-1 pt-1 pb-2 text-white/75 hover:text-white data-[active=true]:text-white',
          "after:absolute after:bottom-1 after:left-0 after:h-[2px] after:w-full after:bg-white after:content-['']",
          'after:-translate-x-[101%] after:transition-transform after:duration-300 after:ease-[cubic-bezier(0.39,0.575,0.565,1)]',
          'hover:after:translate-x-0 data-[active=true]:after:translate-x-0',
        ],
        pill: 'rounded-full px-4 py-1.5 text-white/85 hover:text-white data-[active=true]:bg-white data-[active=true]:text-brand data-[active=true]:shadow-sm',
        solid:
          'rounded-xl px-4 py-1.5 text-brand-dark/70 hover:text-brand-dark data-[active=true]:bg-brand data-[active=true]:text-white',
      },
      size: {
        sm: 'text-xs',
        md: 'text-sm',
        lg: 'text-base',
      },
    },
    defaultVariants: {
      variant: 'underline',
      size: 'md',
    },
  },
);

type TabsVariant = NonNullable<VariantProps<typeof tabVariants>['variant']>;
type TabsSize = NonNullable<VariantProps<typeof tabVariants>['size']>;

type TabsContextValue = {
  value: string;
  onValueChange: (value: string) => void;
  variant: TabsVariant;
  size: TabsSize;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('<Tab> must be rendered inside a <Tabs> component.');
  }
  return context;
}

export type TabsProps = VariantProps<typeof tabListVariants> & {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  'aria-label'?: string;
  children: ReactNode;
};

export function Tabs({
  value,
  onValueChange,
  variant = 'underline',
  size = 'md',
  className,
  children,
  ...rest
}: TabsProps) {
  return (
    <TabsContext.Provider
      value={{ value, onValueChange, variant: variant ?? 'underline', size: size ?? 'md' }}
    >
      <div role="tablist" className={cx(tabListVariants({ variant, size }), className)} {...rest}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export type TabProps = {
  value: string;
  /** Icon shown before the label. Size is predefined — pass only the component. */
  icon?: TabIcon;
  className?: string;
  disabled?: boolean;
  children: ReactNode;
};

export function Tab({ value, icon: Icon, className, disabled, children }: TabProps) {
  const { value: activeValue, onValueChange, variant, size } = useTabsContext();
  const isActive = activeValue === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      data-active={isActive}
      disabled={disabled}
      onClick={() => onValueChange(value)}
      className={cx(tabVariants({ variant, size }), className)}
    >
      {Icon ? <Icon size={TAB_ICON_SIZE} className="shrink-0" aria-hidden /> : null}
      {children}
    </button>
  );
}

export { TAB_ICON_SIZE, tabVariants };
