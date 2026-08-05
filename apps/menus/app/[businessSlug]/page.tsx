import { notFound, redirect } from "next/navigation";
import { getPublicMenu } from "../../components/data";
export default async function MenuHome({params}:{params:Promise<{businessSlug:string}>}){const {businessSlug}=await params;const menu=await getPublicMenu(businessSlug);if(!menu)notFound();redirect(`/${businessSlug}/${menu.business.mode==="Animated"&&menu.business.hasAnimatedMenu?"animated":"pdf"}`)}
