import sys
import json
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

def main():
    model_name = "b4c0n/KAi-Toxicity-Filter"
    try:
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForSequenceClassification.from_pretrained(model_name)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

    # Read from stdin
    for line in sys.stdin:
        text = line.strip()
        if not text:
            continue
        
        try:
            inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
            with torch.no_grad():
                outputs = model(**inputs)
            
            probs = torch.nn.functional.softmax(outputs.logits, dim=-1)
            toxic_prob = probs[0][1].item()
            
            print(json.dumps({"text": text, "toxic_probability": toxic_prob}))
            sys.stdout.flush()
        except Exception as e:
            print(json.dumps({"error": str(e)}))
            sys.stdout.flush()

if __name__ == "__main__":
    main()
