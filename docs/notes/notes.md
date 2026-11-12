```
think I'd like to dedicate more time to planning and documentation stage. That way we can focus and describe the app in details. Separate docs for Vision, Tech stack, Architecture, Feature list and UI Design Language. Save later artifacts to docs_v2 dir

Let's start with:
```

# Vision
The app vision:

The name is "GILDEX" (as in Gilded Indes)

A local desktop catalog for media collections (focus on imags, short videos, small files).
The basic functionality is organization of local stash of media and making it presentable and easy to browse through.
Focus on personal AI generated media (images/videos/audio), like a personal portfolio.
The problem the app is to solve, is this: 
- Process of AI content generation involves many iterations (regens, manual fixes, model swaps, small drifts, etc), resulting in a large heap of similar files, that are tedious to look through. But you often want to browse through your "portfolio" of works, to see all the different ideas/concepts you did, to see how did the style change, to maybe continue on an idea you didn't finish before, etc. Having an app that presents such content in a neat, organized way would be helpful.

- Core features:
    - **Auto "session-sort"**. Offten you work towards an "idea" you want to capture. And generations, produced as a result offten are similar, have iterative nature, and can be grouped by a time period -- a session.  
    - **Tag system**. Each image can be tagged, and tags are can be used as a separate index for search and organization. Since we are dealing with many images -- batch tagging is necessary. (An auto-tagging system is planned, but is an optional feature)
    - **Gen Media Entity**. Each generation can be presented as a separate "story" entity (generation result + prompt). 
    - **Collection system**. User authored organization index. Example: selected best generations united by a scenario, unfinished work, ideas collection. 
    - **Gen-parameters autoparsing**. We mainly need the prompt, and model name.   
    - **Lineage system**. TBD. Keep it of scope for now. For showing iterative progression (inffered from gen datetime, and maybe prompts, with manual edit option) 


    We should talk about another split. Extensive attachment system (notes, local regions, cross-links, small files, etc). I'd like to keep this all out of main view, and into a separate view (screen or detached window). A deep inspection of an item or a collection or a session.