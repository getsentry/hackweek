import {components} from 'react-select';

export function MultiValueContainer({children, ...props}) {
  return (
    <components.MultiValueContainer className="HEY" {...props}>
      <div className="MultiValueContainer">{children}</div>
    </components.MultiValueContainer>
  );
}

export function MultiValueLabel({children, ...props}) {
  return (
    <components.MultiValueLabel {...props}>
      <div className="MultiValueLabel">{children}</div>
    </components.MultiValueLabel>
  );
}

export function MultiValueRemove({children, ...props}) {
  return (
    <components.MultiValueRemove {...props}>
      <div className="MultiValueRemove">x</div>
    </components.MultiValueRemove>
  );
}
