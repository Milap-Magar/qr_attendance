import { NavLink, useMatch, useSubmit } from "react-router";
import {
  Building2Icon,
  CalendarClockIcon,
  ChevronsUpDownIcon,
  ClipboardCheckIcon,
  GlobeIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  QrCodeIcon,
  ScanLineIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

import { LogoMark } from "~/components/logo";

import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "~/components/ui/sidebar";
import { BRAND } from "~/lib/brand";
import { capitalize, initials, orgNoun, roleLabel } from "~/lib/format";
import type { Me } from "~/lib/types";

type NavItem = { title: string | ((me: Me) => string); to: string; icon: LucideIcon; show: (me: Me) => boolean };

// each link is shown only if the user's permissions (from GET /api/users/me) allow it
const NAV: NavItem[] = [
  { title: "Overview", to: "/dashboard", icon: LayoutDashboardIcon, show: (me) => !me.permissions.includes("platform:manage") },
  { title: "Schools", to: "/schools", icon: GlobeIcon, show: (me) => me.permissions.includes("platform:manage") },
  { title: "Scanner", to: "/scan", icon: ScanLineIcon, show: (me) => me.permissions.includes("attendance:scan") },
  { title: "Sessions", to: "/sessions", icon: CalendarClockIcon, show: (me) => me.permissions.includes("sessions:manage") },
  { title: "Users", to: "/users", icon: UsersIcon, show: (me) => me.permissions.includes("users:read") },
  { title: "My QR", to: "/my-qr", icon: QrCodeIcon, show: (me) => me.permissions.includes("qr:self") },
  { title: "My attendance", to: "/attendance", icon: ClipboardCheckIcon, show: (me) => me.role === "users" },
  {
    title: (me) => capitalize(orgNoun[me.organization?.type ?? "school"]!),
    to: "/school",
    icon: Building2Icon,
    show: (me) => me.permissions.includes("organization:manage"),
  },
];

function NavItemLink({ item, me }: { item: NavItem; me: Me }) {
  // "/sessions" stays highlighted on "/sessions/123"
  const isActive = useMatch({ path: item.to, end: false }) !== null;
  const title = typeof item.title === "function" ? item.title(me) : item.title;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={title}>
        <NavLink to={item.to}>
          <item.icon />
          <span>{title}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar({ me }: { me: Me }) {
  const submit = useSubmit();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/dashboard">
                <LogoMark className="size-8!" /> {/* ! beats the menu button's svg:size-4 */}
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">{BRAND.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{me.organization?.name ?? "Platform admin"}</span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.filter((item) => item.show(me)).map((item) => (
                <NavItemLink key={item.to} item={item} me={me} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">{initials(me.name)}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{me.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{roleLabel[me.role]}</span>
                  </div>
                  <ChevronsUpDownIcon className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="font-medium">{me.name}</div>
                  <div className="text-xs text-muted-foreground">{me.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => submit(null, { method: "post", action: "/logout" })}>
                  <LogOutIcon />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
