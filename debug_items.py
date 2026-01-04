"""检查 items_selected 的实际数据结构"""
import pickle

# 加载最新的 context
ctx_path = 'out/runs/20260104/212614_151977_life-c/.context.pkl'
with open(ctx_path, 'rb') as f:
    ctx = pickle.load(f)

print(f"选中 {len(ctx.items_selected)} items\n")

for i, item in enumerate(ctx.items_selected[:3]):
    print(f"Item {i+1}:")
    print(f"  ID: {item.get('id')}")
    print(f"  Title: {item.get('title', '')[:60]}")
    print(f"  Source: {item.get('source_name', '')}")
    print(f"  Content length: {len(item.get('content', ''))} chars")
    print(f"  Summary length: {len(item.get('summary', ''))} chars")
    
    # 打印所有可用字段
    print(f"  Available fields: {list(item.keys())}")
    
    # 如果有 content，打印前100字符
    content = item.get('content', '')
    if content:
        print(f"  Content preview: {content[:100]}...")
    else:
        print(f"  Content: EMPTY")
    
    print()
