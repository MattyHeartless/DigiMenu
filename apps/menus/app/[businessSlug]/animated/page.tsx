import { notFound, redirect } from "next/navigation";
import { getPublicMenu } from "../../../components/data";
import ViudaNegraMenu from "../../../custom-menus/viuda-negra/ViudaNegraMenu";
export default async function AnimatedMenu({params}:{params:Promise<{businessSlug:string}>}){const {businessSlug}=await params;const menu=await getPublicMenu(businessSlug);if(!menu)notFound();if(!menu.business.hasAnimatedMenu||!menu.business.animatedMenuKey)redirect(`/${businessSlug}/pdf`);if(menu.business.animatedMenuKey==="viuda-negra-v1")return <ViudaNegraMenu menu={menu}/>;redirect(`/${businessSlug}/pdf`)}
