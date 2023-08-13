function toRPN(node) {
    let outputStack = [];
    let opStack = [];
  
    function handleNode(node) {
	  switch (node.type) {
            case "BinaryExpression":
		  handleOperator(node.operator);
		  handleNode(node.left);
		  handleNode(node.right);
		  break;
            default:
                outputStack.push(node);
	  }
    }
  
    function handleOperator(op) {
	  while (opStack.length > 0) {
            const topOp = opStack[opStack.length - 1];
            if (
		  operators[topOp].prec > operators[op].prec ||
		  (operators[topOp].prec === operators[op].prec && operators[op].assoc === "left")
            ) {
		  const right = outputStack.pop();
		  const left = outputStack.pop();
		  outputStack.push({
                    type: "BinaryExpression",
                    operator: opStack.pop(),
                    left: left,
                    right: right
		  });
            } else {
		  break;
            }
	  }
	  opStack.push(op);
    }
  
    handleNode(node);
  
    while (opStack.length > 0) {
	  const right = outputStack.pop();
	  const left = outputStack.pop();
	  outputStack.push({
            type: "BinaryExpression",
            operator: opStack.pop(),
            left: left,
            right: right
	  });
    }
  
    return outputStack[0];
}