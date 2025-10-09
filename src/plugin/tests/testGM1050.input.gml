var _condition = false;

function check(localValue)
{
    var counter = 0;
    if (self.localValue)
    {
        self.localValue = counter + 1;
    }

    counter = self.counter + self.localValue;
    return self.localValue + counter;
}

if (self._condition)
{
    self._condition = true;
}
